// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '../modules/V2SwapRouter.sol';
import '../modules/V3SwapRouter.sol';
import '../modules/Payments.sol';
import '../base/RouterCallbacks.sol';
import '../Router.sol';

// Command Types
enum CommandType {
    PERMIT,
    TRANSFER,
    V3_SWAP_EXACT_IN,
    V3_SWAP_EXACT_OUT,
    V2_SWAP_EXACT_IN,
    V2_SWAP_EXACT_OUT,
    SEAPORT,
    NFTX,
    LOOKS_RARE,
    X2Y2,
    WRAP_ETH,
    UNWRAP_WETH,
    SWEEP
}

contract Commands is V2SwapRouter, V3SwapRouter, RouterCallbacks {
    error InvalidCommandType(uint256 commandIndex);

    address immutable PERMIT_POST;

    constructor(
        address permitPost,
        address v2Factory,
        address v3Factory,
        bytes32 pairInitCodeHash,
        bytes32 poolInitCodeHash
    ) V2SwapRouter(v2Factory, pairInitCodeHash) V3SwapRouter(v3Factory, poolInitCodeHash) {
        PERMIT_POST = permitPost;
    }

    /// @notice executes the given command with the given inputs
    /// @param command The command to execute
    /// @param inputs The inputs to execute the command with
    /// @return success true on success, false on failure
    /// @return output The outputs, if any from the command
    function dispatch(CommandType command, bytes memory inputs, uint256 commandIndex)
        internal
        returns (bool success, bytes memory output)
    {
        success = true;
        if (command == CommandType.PERMIT) {
            // state[state.length] = abi.encode(msg.sender);
            // (success, output) = permitPost.call(state[0]);
            // bytes memory inputs = state.build(bytes4(0), indices);
            // (address some, address parameters, uint256 forPermit) = abi.decode(inputs, (address, address, uint));
            //
            // permitPost.permitWithNonce(msg.sender, some, parameters, forPermit);
        } else if (command == CommandType.TRANSFER) {
            (address token, address recipient, uint256 value) = abi.decode(inputs, (address, address, uint256));
            Payments.payERC20(token, recipient, value);
        } else if (command == CommandType.V2_SWAP_EXACT_IN) {
            (uint256 amountOutMin, address[] memory path, address recipient) =
                abi.decode(inputs, (uint256, address[], address));
            output = abi.encode(v2SwapExactInput(amountOutMin, path, recipient));
        } else if (command == CommandType.V2_SWAP_EXACT_OUT) {
            (uint256 amountOut, uint256 amountInMax, address[] memory path, address recipient) =
                abi.decode(inputs, (uint256, uint256, address[], address));
            output = abi.encode(v2SwapExactOutput(amountOut, amountInMax, path, recipient));
        } else if (command == CommandType.V3_SWAP_EXACT_IN) {
            (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                abi.decode(inputs, (address, uint256, uint256, bytes));
            output = abi.encode(v3SwapExactInput(recipient, amountIn, amountOutMin, path));
        } else if (command == CommandType.V3_SWAP_EXACT_OUT) {
            (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                abi.decode(inputs, (address, uint256, uint256, bytes));
            output = abi.encode(v3SwapExactOutput(recipient, amountIn, amountOutMin, path));
        } else if (command == CommandType.SEAPORT) {
            (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
            (success, output) = Constants.SEAPORT.call{value: value}(data);
        } else if (command == CommandType.NFTX) {
            (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
            (success, output) = Constants.NFTX_ZAP.call{value: value}(data);
        } else if (command == CommandType.LOOKS_RARE) {
            (success, output) = callAndTransferERC721(inputs, Constants.LOOKS_RARE);
        } else if (command == CommandType.X2Y2) {
            (success, output) = callAndTransferERC721(inputs, Constants.X2Y2);
        } else if (command == CommandType.SWEEP) {
            (address token, address recipient, uint256 minValue) = abi.decode(inputs, (address, address, uint256));
            Payments.sweepToken(token, recipient, minValue);
        } else if (command == CommandType.WRAP_ETH) {
            (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
            Payments.wrapETH(recipient, amountMin);
        } else if (command == CommandType.UNWRAP_WETH) {
            (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
            Payments.unwrapWETH9(recipient, amountMin);
        } else {
            revert InvalidCommandType({commandIndex: commandIndex});
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
