// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {ISignatureTransfer} from 'permit2/src/interfaces/ISignatureTransfer.sol';

/// @title IBalanceSwapProxy
/// @notice Full-balance swaps through the Universal Router, with an optional pre-signed
///         (Permit2 witness) relayed mode. The proxy is stateless and non-custodial: tokens
///         are pulled straight into the router and swapped with payerIsUser=false.
interface IBalanceSwapProxy {
    /// @notice The swap terms. In the signed mode these are witness-bound (signed alongside a
    ///         route hash the proxy derives from commands/inputs); in the direct modes they are
    ///         supplied by the owner-caller. Every field is honored in every mode.
    struct SwapIntent {
        /// @dev The Universal Router this intent executes against
        address router;
        /// @dev Output token; address(0) = native ETH (route must end with UNWRAP_WETH to recipient)
        address tokenOut;
        /// @dev Where output must land (balance-delta-checked); never the MSG_SENDER sentinel
        address recipient;
        /// @dev Minimum output-per-input rate in base units, 1e36 fixed point; 0 disables the check
        uint256 minPriceX36;
        /// @dev Execute only if the resolved input amount is at least this (anti-dust-grief)
        uint256 minAmount;
    }

    /// @notice Thrown when tokenIn == intent.tokenOut
    error SameToken();
    /// @notice Thrown when the resolved amount is zero or below intent.minAmount
    error InsufficientBalance(uint256 amount, uint256 minAmount);
    /// @notice Thrown when the recipient's output delta is below amount * minPriceX36 / 1e36
    error InsufficientOutput(uint256 delta, uint256 floor);

    /// @notice Relayed mode: pulls min(balanceOf(owner), permit cap) into the router via
    ///         permitWitnessTransferFrom, executes the signed route, enforces the signed floor.
    /// @dev The witness hash is computed from (keccak256(abi.encode(commands, inputs)), intent),
    ///      so tampered routes fail Permit2 signature verification. permit.deadline doubles as
    ///      the router execution deadline. Callable by anyone; the caller only pays gas.
    /// @param permit permitted = {tokenIn, cap}; single-use unordered nonce; deadline = intent TTL
    /// @param permitSig The owner's signature over the permit + SwapIntent witness
    /// @param owner The permit signer; tokens are pulled from here
    /// @param intent The swap terms bound into the witness
    /// @param commands The Universal Router commands (route-hash-bound into the witness)
    /// @param inputs The Universal Router inputs (route-hash-bound into the witness)
    function executeWithSig(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        address owner,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external;

    /// @notice Direct mode: pulls msg.sender's full tokenIn balance via a plain ERC20 allowance
    ///         granted to this contract, then executes and enforces the caller-supplied terms.
    function execute(
        address tokenIn,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external;

    /// @notice Direct mode: same as execute(), but pulls via the caller's standing Permit2
    ///         AllowanceTransfer approval (this contract as spender).
    function executeWithPermit2Allowance(
        address tokenIn,
        SwapIntent calldata intent,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external;
}
