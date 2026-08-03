// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ISignatureTransfer} from 'permit2/src/interfaces/ISignatureTransfer.sol';
import {SafeCast160} from 'permit2/src/libraries/SafeCast160.sol';
import {Constants} from './libraries/Constants.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';
import {IBalanceSwapProxy} from './interfaces/IBalanceSwapProxy.sol';

/// @title BalanceSwapProxy
/// @notice Swaps a user's entire token balance through the Universal Router — relayed via a
///         pre-signed, route-bound Permit2 witness, or directly by the owner via a standing
///         approval (plain ERC20 or Permit2 AllowanceTransfer).
/// @dev Stateless and non-custodial: tokens are pulled straight into the router (never held
///      here) and the route runs against the router's own balance.
///      Route requirements (mirroring SwapProxy):
///      - All swap commands MUST use payerIsUser=false.
///      - All recipients MUST be explicit addresses, never the MSG_SENDER sentinel, which
///        resolves to this proxy inside router execution.
///      - Routes SHOULD consume the full pulled amount (CONTRACT_BALANCE / OPEN_DELTA inputs)
///        and SWEEP any residue: anything left in the router is stealable by the next caller.
///      - Fee-on-transfer and rebasing input tokens are unsupported (floor is computed on the
///        pulled amount and will bias toward revert).
///      - Native input is unsupported; native output is expressed as tokenOut = address(0)
///        with a route ending in UNWRAP_WETH(recipient, 0).
contract BalanceSwapProxy is IBalanceSwapProxy {
    using SafeTransferLib for ERC20;
    using SafeCast160 for uint256;

    /// @notice EIP-712 typehash of the witness struct signed alongside the Permit2 transfer.
    /// @dev routeHash = keccak256(abi.encode(commands, inputs)), derived in-contract.
    bytes32 public constant SWAP_INTENT_TYPEHASH = keccak256(
        'SwapIntent(bytes32 routeHash,address router,address tokenOut,address recipient,uint256 minPriceX36,uint256 minAmount)'
    );

    /// @notice Witness type suffix completing Permit2's PermitWitnessTransferFrom typehash stub
    string public constant WITNESS_TYPE_STRING =
        'SwapIntent witness)SwapIntent(bytes32 routeHash,address router,address tokenOut,address recipient,uint256 minPriceX36,uint256 minAmount)TokenPermissions(address token,uint256 amount)';

    IPermit2 public immutable PERMIT2;

    constructor(IPermit2 permit2) {
        PERMIT2 = permit2;
    }

    /// @inheritdoc IBalanceSwapProxy
    function executeWithSig(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        address owner,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external {
        uint256 amount = _resolveAmount(permit.permitted.token, intent, owner, permit.permitted.amount);
        uint256 balBefore = _outputBalance(intent.tokenOut, intent.recipient);

        // Pull straight into the router. Permit2 verifies the witness (including the derived
        // route hash), consumes the unordered nonce, and enforces permit.deadline.
        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: intent.router, requestedAmount: amount}),
            owner,
            _hashIntent(intent, keccak256(abi.encode(commands, inputs))),
            WITNESS_TYPE_STRING,
            permitSig
        );

        IUniversalRouter(intent.router).execute(commands, inputs, permit.deadline);

        _checkOutput(intent, amount, balBefore);
    }

    /// @inheritdoc IBalanceSwapProxy
    function execute(
        address tokenIn,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external {
        uint256 amount = _resolveAmount(tokenIn, intent, msg.sender, type(uint256).max);
        uint256 balBefore = _outputBalance(intent.tokenOut, intent.recipient);

        ERC20(tokenIn).safeTransferFrom(msg.sender, intent.router, amount);
        IUniversalRouter(intent.router).execute(commands, inputs, deadline);

        _checkOutput(intent, amount, balBefore);
    }

    /// @inheritdoc IBalanceSwapProxy
    function executeWithPermit2Allowance(
        address tokenIn,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external {
        uint256 amount = _resolveAmount(tokenIn, intent, msg.sender, type(uint256).max);
        uint256 balBefore = _outputBalance(intent.tokenOut, intent.recipient);

        PERMIT2.transferFrom(msg.sender, intent.router, amount.toUint160(), tokenIn);
        IUniversalRouter(intent.router).execute(commands, inputs, deadline);

        _checkOutput(intent, amount, balBefore);
    }

    /// @dev Resolves the amount to swap (full balance, capped) and enforces shared preconditions.
    function _resolveAmount(address tokenIn, SwapIntent calldata intent, address owner, uint256 cap)
        private
        view
        returns (uint256 amount)
    {
        if (tokenIn == intent.tokenOut) revert SameToken();
        amount = ERC20(tokenIn).balanceOf(owner);
        if (amount > cap) amount = cap;
        if (amount == 0 || amount < intent.minAmount) revert InsufficientBalance(amount, intent.minAmount);
    }

    /// @dev Enforces the rate floor on the recipient's output balance delta. minPriceX36 == 0 disables.
    function _checkOutput(SwapIntent calldata intent, uint256 amount, uint256 balBefore) private view {
        if (intent.minPriceX36 == 0) return;
        uint256 delta = _outputBalance(intent.tokenOut, intent.recipient) - balBefore;
        // checked math: overflow (amount > ~1.1e41 base units) reverts, a safe failure mode
        uint256 floor = amount * intent.minPriceX36 / Constants.PRICE_PRECISION;
        if (delta < floor) revert InsufficientOutput(delta, floor);
    }

    /// @dev tokenOut == address(0) means native ETH
    function _outputBalance(address tokenOut, address recipient) private view returns (uint256) {
        return tokenOut == address(0) ? recipient.balance : ERC20(tokenOut).balanceOf(recipient);
    }

    /// @dev EIP-712 hash of the SwapIntent witness with the derived route hash folded in
    function _hashIntent(SwapIntent calldata intent, bytes32 routeHash) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                SWAP_INTENT_TYPEHASH,
                routeHash,
                intent.router,
                intent.tokenOut,
                intent.recipient,
                intent.minPriceX36,
                intent.minAmount
            )
        );
    }
}
