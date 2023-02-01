// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

// Command implementations
import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';
import {Payments} from './modules/Payments.sol';
import {RewardsCollector} from './base/RewardsCollector.sol';

// Admin helpers
import {LockAndMsgSender} from './base/LockAndMsgSender.sol';
import {RouterImmutables} from './base/RouterImmutables.sol';
import {Callbacks} from './base/Callbacks.sol';
import {Commands} from './libraries/Commands.sol';
import {RouterParameters, RouterImmutables} from './base/RouterImmutables.sol';

// Interfaces
import {ERC721} from 'solmate/src/tokens/ERC721.sol';
import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {ICryptoPunksMarket} from './interfaces/external/ICryptoPunksMarket.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';

contract UniversalRouter is
    IUniversalRouter,
    RouterImmutables,
    RewardsCollector,
    Payments,
    V2SwapRouter,
    V3SwapRouter,
    Callbacks,
    LockAndMsgSender
{
    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(RouterParameters memory params) RouterImmutables(params) {}

    /// @inheritdoc IUniversalRouter
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
    {
        execute(commands, inputs);
    }

    /// @inheritdoc IUniversalRouter
    function execute(bytes calldata commands, bytes[] calldata inputs) public payable isNotLocked {
        bool success;
        bytes memory output;
        uint256 numCommands = commands.length;
        if (inputs.length != numCommands) revert LengthMismatch();

        // loop through all given commands, execute them and pass along outputs as defined
        for (uint256 commandIndex = 0; commandIndex < numCommands;) {
            bytes1 command = commands[commandIndex];

            bytes memory input = inputs[commandIndex];

            (success, output) = dispatch(command, input);

            if (!success && successRequired(command)) {
                revert ExecutionFailed({commandIndex: commandIndex, message: output});
            }

            unchecked {
                commandIndex++;
            }
        }
    }

    function successRequired(bytes1 command) internal pure returns (bool) {
        return command & Commands.FLAG_ALLOW_REVERT == 0;
    }

    /// @notice Decodes and executes the given command with the given inputs
    /// @param commandType The command type to execute
    /// @param inputs The inputs to execute the command with
    /// @dev 2 masks are used to enable use of a nested-if statement in execution for efficiency reasons
    /// @return success True on success of the command, false on failure
    /// @return output The outputs or error messages, if any, from the command
    function dispatch(bytes1 commandType, bytes memory inputs) internal returns (bool success, bytes memory output) {
        uint256 command = uint8(commandType & Commands.COMMAND_TYPE_MASK);

        success = true;

        if (command < 0x20) {
            if (command < 0x10) {
                // 0x00 <= command < 0x08
                if (command < 0x08) {
                    if (command == Commands.V3_SWAP_EXACT_IN) {
                        (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path, bool payerIsUser)
                        = abi.decode(inputs, (address, uint256, uint256, bytes, bool));
                        address payer = payerIsUser ? isLockedSender : address(this);
                        v3SwapExactInput(map(recipient), amountIn, amountOutMin, path, payer);
                    } else if (command == Commands.V3_SWAP_EXACT_OUT) {
                        (address recipient, uint256 amountOut, uint256 amountInMax, bytes memory path, bool payerIsUser)
                        = abi.decode(inputs, (address, uint256, uint256, bytes, bool));
                        address payer = payerIsUser ? isLockedSender : address(this);
                        v3SwapExactOutput(map(recipient), amountOut, amountInMax, path, payer);
                    } else if (command == Commands.PERMIT2_TRANSFER_FROM) {
                        (address token, address recipient, uint160 amount) =
                            abi.decode(inputs, (address, address, uint160));
                        permit2TransferFrom(token, msg.sender, map(recipient), amount);
                    } else if (command == Commands.PERMIT2_PERMIT_BATCH) {
                        (IAllowanceTransfer.PermitBatch memory permitBatch, bytes memory data) =
                            abi.decode(inputs, (IAllowanceTransfer.PermitBatch, bytes));
                        PERMIT2.permit(msg.sender, permitBatch, data);
                    } else if (command == Commands.SWEEP) {
                        (address token, address recipient, uint256 amountMin) =
                            abi.decode(inputs, (address, address, uint256));
                        Payments.sweep(token, map(recipient), amountMin);
                    } else if (command == Commands.TRANSFER) {
                        (address token, address recipient, uint256 value) =
                            abi.decode(inputs, (address, address, uint256));
                        Payments.pay(token, map(recipient), value);
                    } else if (command == Commands.PAY_PORTION) {
                        (address token, address recipient, uint256 bips) =
                            abi.decode(inputs, (address, address, uint256));
                        Payments.payPortion(token, map(recipient), bips);
                    } else {
                        // placeholder area for command 0x07
                        revert InvalidCommandType(command);
                    }
                    // 0x08 <= command < 0x10
                } else {
                    if (command == Commands.V2_SWAP_EXACT_IN) {
                        (
                            address recipient,
                            uint256 amountIn,
                            uint256 amountOutMin,
                            address[] memory path,
                            bool payerIsUser
                        ) = abi.decode(inputs, (address, uint256, uint256, address[], bool));
                        address payer = payerIsUser ? isLockedSender : address(this);
                        v2SwapExactInput(map(recipient), amountIn, amountOutMin, path, payer);
                    } else if (command == Commands.V2_SWAP_EXACT_OUT) {
                        (
                            address recipient,
                            uint256 amountOut,
                            uint256 amountInMax,
                            address[] memory path,
                            bool payerIsUser
                        ) = abi.decode(inputs, (address, uint256, uint256, address[], bool));
                        address payer = payerIsUser ? isLockedSender : address(this);
                        v2SwapExactOutput(map(recipient), amountOut, amountInMax, path, payer);
                    } else if (command == Commands.PERMIT2_PERMIT) {
                        (IAllowanceTransfer.PermitSingle memory permitSingle, bytes memory data) =
                            abi.decode(inputs, (IAllowanceTransfer.PermitSingle, bytes));
                        PERMIT2.permit(msg.sender, permitSingle, data);
                    } else if (command == Commands.WRAP_ETH) {
                        (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                        Payments.wrapETH(map(recipient), amountMin);
                    } else if (command == Commands.UNWRAP_WETH) {
                        (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                        Payments.unwrapWETH9(map(recipient), amountMin);
                    } else if (command == Commands.PERMIT2_TRANSFER_FROM_BATCH) {
                        (IAllowanceTransfer.AllowanceTransferDetails[] memory batchDetails) =
                            abi.decode(inputs, (IAllowanceTransfer.AllowanceTransferDetails[]));
                        permit2TransferFrom(batchDetails, isLockedSender);
                    } else {
                        // placeholder area for commands 0x0e-0x0f
                        revert InvalidCommandType(command);
                    }
                }
                // 0x10 <= command
            } else {
                // 0x10 <= command < 0x18
                if (command < 0x18) {
                    if (command == Commands.SEAPORT) {
                        (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
                        (success, output) = SEAPORT.call{value: value}(data);
                    } else if (command == Commands.LOOKS_RARE_721) {
                        (success, output) = callAndTransfer721(inputs, LOOKS_RARE);
                    } else if (command == Commands.NFTX) {
                        (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
                        (success, output) = NFTX_ZAP.call{value: value}(data);
                    } else if (command == Commands.CRYPTOPUNKS) {
                        (uint256 punkId, address recipient, uint256 value) =
                            abi.decode(inputs, (uint256, address, uint256));
                        (success, output) = CRYPTOPUNKS.call{value: value}(
                            abi.encodeWithSelector(ICryptoPunksMarket.buyPunk.selector, punkId)
                        );
                        if (success) ICryptoPunksMarket(CRYPTOPUNKS).transferPunk(map(recipient), punkId);
                        else output = 'CryptoPunk Trade Failed';
                    } else if (command == Commands.LOOKS_RARE_1155) {
                        (success, output) = callAndTransfer1155(inputs, LOOKS_RARE);
                    } else if (command == Commands.OWNER_CHECK_721) {
                        (address owner, address token, uint256 id) = abi.decode(inputs, (address, address, uint256));
                        success = (ERC721(token).ownerOf(id) == owner);
                        if (!success) output = abi.encodePacked(InvalidOwnerERC721.selector);
                    } else if (command == Commands.OWNER_CHECK_1155) {
                        (address owner, address token, uint256 id, uint256 minBalance) =
                            abi.decode(inputs, (address, address, uint256, uint256));
                        success = (ERC1155(token).balanceOf(owner, id) >= minBalance);
                        if (!success) output = abi.encodePacked(InvalidOwnerERC1155.selector);
                    } else if (command == Commands.SWEEP_ERC721) {
                        (address token, address recipient, uint256 id) = abi.decode(inputs, (address, address, uint256));
                        Payments.sweepERC721(token, map(recipient), id);
                    }
                    // 0x18 <= command < 0x1f
                } else {
                    if (command == Commands.X2Y2_721) {
                        (success, output) = callAndTransfer721(inputs, X2Y2);
                    } else if (command == Commands.SUDOSWAP) {
                        (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
                        (success, output) = SUDOSWAP.call{value: value}(data);
                    } else if (command == Commands.NFT20) {
                        (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
                        (success, output) = NFT20_ZAP.call{value: value}(data);
                    } else if (command == Commands.X2Y2_1155) {
                        (success, output) = callAndTransfer1155(inputs, X2Y2);
                    } else if (command == Commands.FOUNDATION) {
                        (success, output) = callAndTransfer721(inputs, FOUNDATION);
                    } else if (command == Commands.SWEEP_ERC1155) {
                        (address token, address recipient, uint256 id, uint256 amount) =
                            abi.decode(inputs, (address, address, uint256, uint256));
                        Payments.sweepERC1155(token, map(recipient), id, amount);
                    } else {
                        // placeholder area for commands 0x1e-0x1f
                        revert InvalidCommandType(command);
                    }
                }
            }
            // 0x20 <= command
        } else {
            if (command == Commands.EXECUTE_SUB_PLAN) {
                (bytes memory _commands, bytes[] memory _inputs) = abi.decode(inputs, (bytes, bytes[]));
                (success, output) =
                    (address(this)).call(abi.encodeWithSignature('execute(bytes,bytes[])', _commands, _inputs));
            } else {
                // placeholder area for commands 0x21-0x3f
                revert InvalidCommandType(command);
            }
        }
    }

    /// @notice Performs a call to purchase an ERC721, then transfers the ERC721 to a specified recipient
    /// @param inputs The inputs for the protocol and ERC721 transfer, encoded
    /// @param protocol The protocol to pass the calldata to
    /// @return success True on success of the command, false on failure
    /// @return output The outputs or error messages, if any, from the command
    function callAndTransfer721(bytes memory inputs, address protocol)
        internal
        returns (bool success, bytes memory output)
    {
        (uint256 value, bytes memory data, address recipient, address token, uint256 id) =
            abi.decode(inputs, (uint256, bytes, address, address, uint256));
        (success, output) = protocol.call{value: value}(data);
        if (success) ERC721(token).safeTransferFrom(address(this), map(recipient), id);
    }

    /// @notice Performs a call to purchase an ERC1155, then transfers the ERC1155 to a specified recipient
    /// @param inputs The inputs for the protocol and ERC1155 transfer, encoded
    /// @param protocol The protocol to pass the calldata to
    /// @return success True on success of the command, false on failure
    /// @return output The outputs or error messages, if any, from the command
    function callAndTransfer1155(bytes memory inputs, address protocol)
        internal
        returns (bool success, bytes memory output)
    {
        (uint256 value, bytes memory data, address recipient, address token, uint256 id, uint256 amount) =
            abi.decode(inputs, (uint256, bytes, address, address, uint256, uint256));
        (success, output) = protocol.call{value: value}(data);
        if (success) ERC1155(token).safeTransferFrom(address(this), map(recipient), id, amount, new bytes(0));
    }

    /// @notice To receive ETH from WETH and NFT protocols
    receive() external payable {}
}
