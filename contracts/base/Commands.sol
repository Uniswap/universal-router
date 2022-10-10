// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '../modules/V2SwapRouter.sol';
import '../modules/V3SwapRouter.sol';
import '../modules/Payments.sol';
import '../base/RouterCallbacks.sol';
import {ERC721} from 'solmate/src/tokens/ERC721.sol';
import '../../lib/permitpost/src/interfaces/IPermitPost.sol';

// Command Types
uint256 constant PERMIT_POST = 0x00;
uint256 constant TRANSFER = 0x01;
uint256 constant V3_SWAP_EXACT_IN = 0x02;
uint256 constant V3_SWAP_EXACT_OUT = 0x03;
uint256 constant V2_SWAP_EXACT_IN = 0x04;
uint256 constant V2_SWAP_EXACT_OUT = 0x05;
uint256 constant SEAPORT = 0x06;
uint256 constant NFTX = 0x0a;
uint256 constant LOOKS_RARE = 0x0b;
uint256 constant X2Y2 = 0x0c;
uint256 constant WRAP_ETH = 0x07;
uint256 constant UNWRAP_WETH = 0x08;
uint256 constant SWEEP = 0x09;

contract Commands is V2SwapRouter, V3SwapRouter, RouterCallbacks {
    address immutable PERMIT_POST_CONTRACT;

    error InvalidCommandType(uint256 commandType);

    constructor(
        address permitPost,
        address v2Factory,
        address v3Factory,
        bytes32 pairInitCodeHash,
        bytes32 poolInitCodeHash
    ) V2SwapRouter(v2Factory, pairInitCodeHash) V3SwapRouter(v3Factory, poolInitCodeHash) {
        PERMIT_POST_CONTRACT = permitPost;
    }

    /// @notice executes the given command with the given inputs
    /// @param command The command to execute
    /// @param inputs The inputs to execute the command with
    /// @return success true on success, false on failure
    /// @return output The outputs, if any from the command
    function dispatch(uint256 command, bytes memory inputs) internal returns (bool success, bytes memory output) {
        success = true;
        if (command == PERMIT_POST) {
            (bytes memory data) = abi.decode(inputs, (bytes));
            // pass in the msg.sender as the first parameter `from`
            data = bytes.concat(IPermitPost.transferFrom.selector, abi.encodePacked(uint256(uint160(msg.sender))), data);
            (success, output) = PERMIT_POST_CONTRACT.call(data);
        } else if (command == TRANSFER) {
            (address token, address recipient, uint256 value) = abi.decode(inputs, (address, address, uint256));
            Payments.payERC20(token, recipient, value);
        } else if (command == V2_SWAP_EXACT_IN) {
            (uint256 amountOutMin, address[] memory path, address recipient) =
                abi.decode(inputs, (uint256, address[], address));
            output = abi.encode(v2SwapExactInput(amountOutMin, path, recipient));
        } else if (command == V2_SWAP_EXACT_OUT) {
            (uint256 amountOut, uint256 amountInMax, address[] memory path, address recipient) =
                abi.decode(inputs, (uint256, uint256, address[], address));
            output = abi.encode(v2SwapExactOutput(amountOut, amountInMax, path, recipient));
        } else if (command == V3_SWAP_EXACT_IN) {
            (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                abi.decode(inputs, (address, uint256, uint256, bytes));
            output = abi.encode(v3SwapExactInput(recipient, amountIn, amountOutMin, path));
        } else if (command == V3_SWAP_EXACT_OUT) {
            (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                abi.decode(inputs, (address, uint256, uint256, bytes));
            output = abi.encode(v3SwapExactOutput(recipient, amountIn, amountOutMin, path));
        } else if (command == SEAPORT) {
            (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
            (success, output) = Constants.SEAPORT.call{value: value}(data);
        } else if (command == NFTX) {
            (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
            (success, output) = Constants.NFTX_ZAP.call{value: value}(data);
        } else if (command == LOOKS_RARE) {
            (success, output) = callAndTransferERC721(inputs, Constants.LOOKS_RARE);
        } else if (command == X2Y2) {
            (success, output) = callAndTransferERC721(inputs, Constants.X2Y2);
        } else if (command == SWEEP) {
            (address token, address recipient, uint256 minValue) = abi.decode(inputs, (address, address, uint256));
            Payments.sweepToken(token, recipient, minValue);
        } else if (command == WRAP_ETH) {
            (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
            Payments.wrapETH(recipient, amountMin);
        } else if (command == UNWRAP_WETH) {
            (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
            Payments.unwrapWETH9(recipient, amountMin);
        } else {
            revert InvalidCommandType(command);
        }
    }

    function callAndTransferERC721(bytes memory inputs, address protocol)
        internal
        returns (bool success, bytes memory output)
    {
        (uint256 value, bytes memory data, address recipient, address token, uint256 id) =
            abi.decode(inputs, (uint256, bytes, address, address, uint256));
        (success, output) = protocol.call{value: value}(data);
        if (success) ERC721(token).safeTransferFrom(address(this), recipient, id);
    }
}
