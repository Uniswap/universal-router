// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from '../modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from '../modules/uniswap/v3/V3SwapRouter.sol';
import {Payments} from '../modules/Payments.sol';
import {RouterImmutables} from '../base/RouterImmutables.sol';
import {Callbacks} from '../base/Callbacks.sol';
import {Commands} from '../libraries/Commands.sol';
import {Recipient} from '../libraries/Recipient.sol';
import {ERC721} from 'solmate/src/tokens/ERC721.sol';
import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {ICryptoPunksMarket} from '../interfaces/external/ICryptoPunksMarket.sol';

/// @title Decodes and Executes Commands
/// @notice Called by the UniversalRouter contract to efficiently decode and execute a singular command
abstract contract Dispatcher is Payments, V2SwapRouter, V3SwapRouter, Callbacks {
    using Recipient for address;

    error InvalidCommandType(uint256 commandType);
    error InvalidOwnerERC721();
    error InvalidOwnerERC1155();

    /// @notice Decodes and executes the given command with the given inputs
    /// @param commandType The command type to execute
    /// @param inputs The inputs to execute the command with
    /// @dev 2 masks are used to enable use of a nested-if statement in execution for efficiency reasons
    /// @return success True on success of the command, false on failure
    /// @return output The outputs or error messages, if any, from the command
    function dispatch(bytes1 commandType, bytes memory inputs) internal returns (bool success, bytes memory output) {
        uint256 command = uint8(commandType & Commands.COMMAND_TYPE_MASK);

        success = true;

        if (command < 0x10) {
            // 0x00 <= command < 0x08
            if (command < 0x08) {
                if (command == Commands.V3_SWAP_EXACT_IN) {
                    (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path, bool payerIsUser) =
                        abi.decode(inputs, (address, uint256, uint256, bytes, bool));
                    address payer = payerIsUser ? msg.sender : address(this);
                    v3SwapExactInput(recipient.map(), amountIn, amountOutMin, path, payer);
                } else if (command == Commands.V3_SWAP_EXACT_OUT) {
                    (address recipient, uint256 amountOut, uint256 amountInMax, bytes memory path, bool payerIsUser) =
                        abi.decode(inputs, (address, uint256, uint256, bytes, bool));
                    address payer = payerIsUser ? msg.sender : address(this);
                    v3SwapExactOutput(recipient.map(), amountOut, amountInMax, path, payer);
                } else if (command == Commands.PERMIT2_TRANSFER_FROM) {
                    (address token, address recipient, uint160 amount) = abi.decode(inputs, (address, address, uint160));
                    permit2TransferFrom(token, msg.sender, recipient, amount);
                } else if (command == Commands.PERMIT2_PERMIT_BATCH) {
                    (IAllowanceTransfer.PermitBatch memory permitBatch, bytes memory data) =
                        abi.decode(inputs, (IAllowanceTransfer.PermitBatch, bytes));
                    PERMIT2.permit(msg.sender, permitBatch, data);
                } else if (command == Commands.SWEEP) {
                    (address token, address recipient, uint256 amountMin) =
                        abi.decode(inputs, (address, address, uint256));
                    Payments.sweep(token, recipient.map(), amountMin);
                } else if (command == Commands.TRANSFER) {
                    (address token, address recipient, uint256 value) = abi.decode(inputs, (address, address, uint256));
                    Payments.pay(token, recipient.map(), value);
                } else if (command == Commands.PAY_PORTION) {
                    (address token, address recipient, uint256 bips) = abi.decode(inputs, (address, address, uint256));
                    Payments.payPortion(token, recipient.map(), bips);
                } else if (command == Commands.COMMAND_PLACEHOLDER_0x07) {
                    // placeholder for a future command
                    revert InvalidCommandType(command);
                }
                // 0x08 <= command < 0x10
            } else {
                if (command == Commands.V2_SWAP_EXACT_IN) {
                    (address recipient, uint256 amountIn, uint256 amountOutMin, address[] memory path, bool payerIsUser)
                    = abi.decode(inputs, (address, uint256, uint256, address[], bool));
                    address payer = payerIsUser ? msg.sender : address(this);
                    v2SwapExactInput(recipient.map(), amountIn, amountOutMin, path, payer);
                } else if (command == Commands.V2_SWAP_EXACT_OUT) {
                    (address recipient, uint256 amountOut, uint256 amountInMax, address[] memory path, bool payerIsUser)
                    = abi.decode(inputs, (address, uint256, uint256, address[], bool));
                    address payer = payerIsUser ? msg.sender : address(this);
                    v2SwapExactOutput(recipient.map(), amountOut, amountInMax, path, payer);
                } else if (command == Commands.PERMIT2_PERMIT) {
                    (IAllowanceTransfer.PermitSingle memory permitSingle, bytes memory data) =
                        abi.decode(inputs, (IAllowanceTransfer.PermitSingle, bytes));
                    PERMIT2.permit(msg.sender, permitSingle, data);
                } else if (command == Commands.WRAP_ETH) {
                    (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                    Payments.wrapETH(recipient.map(), amountMin);
                } else if (command == Commands.UNWRAP_WETH) {
                    (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                    Payments.unwrapWETH9(recipient.map(), amountMin);
                } else if (command == Commands.PERMIT2_TRANSFER_FROM_BATCH) {
                    (IAllowanceTransfer.AllowanceTransferDetails[] memory batchDetails) =
                        abi.decode(inputs, (IAllowanceTransfer.AllowanceTransferDetails[]));
                    permit2TransferFrom(batchDetails);
                } else if (command == Commands.COMMAND_PLACEHOLDER_0x0e) {
                    // placeholder for a future command
                    revert InvalidCommandType(command);
                } else if (command == Commands.COMMAND_PLACEHOLDER_0x0f) {
                    // placeholder for a future command
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
                    (uint256 punkId, address recipient, uint256 value) = abi.decode(inputs, (uint256, address, uint256));
                    (success, output) = CRYPTOPUNKS.call{value: value}(
                        abi.encodeWithSelector(ICryptoPunksMarket.buyPunk.selector, punkId)
                    );
                    if (success) ICryptoPunksMarket(CRYPTOPUNKS).transferPunk(recipient.map(), punkId);
                    else output = 'CryptoPunk Trade Failed';
                } else if (command == Commands.LOOKS_RARE_1155) {
                    (success, output) = callAndTransfer1155(inputs, LOOKS_RARE);
                } else if (command == Commands.OWNER_CHECK_721) {
                    (address owner, address token, uint256 id) = abi.decode(inputs, (address, address, uint256));
                    success = (ERC721(token).ownerOf(id) == owner);
                    if (!success) output = abi.encodeWithSignature('InvalidOwnerERC721()');
                } else if (command == Commands.OWNER_CHECK_1155) {
                    (address owner, address token, uint256 id, uint256 minBalance) =
                        abi.decode(inputs, (address, address, uint256, uint256));
                    success = (ERC1155(token).balanceOf(owner, id) >= minBalance);
                    if (!success) output = abi.encodeWithSignature('InvalidOwnerERC1155()');
                } else if (command == Commands.SWEEP_ERC721) {
                    (address token, address recipient, uint256 id) = abi.decode(inputs, (address, address, uint256));
                    Payments.sweepERC721(token, recipient.map(), id);
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
                    Payments.sweepERC1155(token, recipient.map(), id, amount);
                } else if (command == Commands.COMMAND_PLACEHOLDER_0x1e) {
                    // placeholder for a future command
                    revert InvalidCommandType(command);
                } else if (command == Commands.COMMAND_PLACEHOLDER_0x1f) {
                    // placeholder for a future command
                    revert InvalidCommandType(command);
                }
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
        if (success) ERC721(token).safeTransferFrom(address(this), recipient.map(), id);
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
        if (success) ERC1155(token).safeTransferFrom(address(this), recipient.map(), id, amount, new bytes(0));
    }
}
