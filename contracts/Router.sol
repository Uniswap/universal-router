// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './modules/V2SwapRouter.sol';
import './modules/V3SwapRouter.sol';
import './base/Payments.sol';
import './libraries/CommandBuilder.sol';

contract WeirollRouter is V2SwapRouter, V3SwapRouter {
    using CommandBuilder for bytes[];

    error NotGreaterOrEqual(uint256 big, uint256 smol);
    error NotEqual(uint256 equal1, uint256 equal2);
    error ExecutionFailed(uint256 commandIndex, string message);
    error ETHNotAccepted();

    // Command Types
    uint256 constant FLAG_CT_PERMIT = 0x00;
    uint256 constant FLAG_CT_TRANSFER = 0x01;
    uint256 constant FLAG_CT_V3_SWAP_EXACT_IN = 0x02;
    uint256 constant FLAG_CT_V3_SWAP_EXACT_OUT = 0x03;
    uint256 constant FLAG_CT_V2_SWAP_EXACT_IN = 0x04;
    uint256 constant FLAG_CT_V2_SWAP_EXACT_OUT = 0x05;
    uint256 constant FLAG_CT_WRAP_ETH = 0x06;
    uint256 constant FLAG_CT_UNWRAP_WETH = 0x07;
    uint256 constant FLAG_CT_SWEEP = 0x08;

    uint256 constant FLAG_CT_MASK = 0x0f;
    uint256 constant FLAG_EXTENDED_COMMAND = 0x80;
    uint256 constant FLAG_TUPLE_RETURN = 0x40;
    uint256 constant SHORT_COMMAND_FILL = 0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    uint256 constant COMMAND_INDICES_OFFSET = 200;

    address immutable permitPost;

    constructor(address _permitPost) {
        permitPost = _permitPost;
    }

    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param state The state elements that should be used for the input and output of commands
    function execute(bytes memory commands, bytes[] memory state) external payable returns (bytes[] memory) {
        bytes8 command;
        uint256 commandType;
        uint256 flags;
        bytes32 indices;
        bool success;

        bytes memory outdata;

        for (uint256 i; i < commands.length; i += 8) {
            success = true;
            assembly {
                command := mload(add(add(commands, 32), i))
            }

            flags = uint256(uint8(bytes1(command)));
            commandType = flags & FLAG_CT_MASK;

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                indices = commands[i++];
            } else {
                indices = bytes32((uint256(uint64(command)) << COMMAND_INDICES_OFFSET) | SHORT_COMMAND_FILL);
            }

            if (commandType == FLAG_CT_PERMIT) {
                // state[state.length] = abi.encode(msg.sender);
                // (success, outdata) = permitPost.call(state[0]);
                // bytes memory inputs = state.build(bytes4(0), indices);
                // (address some, address parameters, uint256 forPermit) = abi.decode(inputs, (address, address, uint));
                //
                // permitPost.permitWithNonce(msg.sender, some, parameters, forPermit);
            } else if (commandType == FLAG_CT_TRANSFER) {
                bytes memory inputs = state.buildInputs(indices);
                (address token, address recipient, uint256 value) = abi.decode(inputs, (address, address, uint256));
                Payments.pay(token, recipient, value);
            } else if (commandType == FLAG_CT_V2_SWAP_EXACT_IN) {
                bytes memory inputs = state.buildInputs(indices);
                (uint256 amountOutMin, address[] memory path, address recipient) =
                    abi.decode(inputs, (uint256, address[], address));
                outdata = abi.encode(v2SwapExactInput(amountOutMin, path, recipient));
            } else if (commandType == FLAG_CT_V2_SWAP_EXACT_OUT) {
                bytes memory inputs = state.buildInputs(indices);
                (uint256 amountOut, uint256 amountInMax, address[] memory path, address recipient) =
                    abi.decode(inputs, (uint256, uint256, address[], address));
                outdata = abi.encode(v2SwapExactOutput(amountOut, amountInMax, path, recipient));
            } else if (commandType == FLAG_CT_V3_SWAP_EXACT_IN) {
                bytes memory inputs = state.buildInputs(indices);
                (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                    abi.decode(inputs, (address, uint256, uint256, bytes));
                outdata = abi.encode(v3SwapExactInput(recipient, amountIn, amountOutMin, path));
            } else if (commandType == FLAG_CT_V3_SWAP_EXACT_OUT) {
                bytes memory inputs = state.buildInputs(indices);
                (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                    abi.decode(inputs, (address, uint256, uint256, bytes));
                outdata = abi.encode(v3SwapExactOutput(recipient, amountIn, amountOutMin, path));
            } else if (commandType == FLAG_CT_SWEEP) {
                bytes memory inputs = state.buildInputs(indices);
                (address token, address recipient, uint256 minValue) = abi.decode(inputs, (address, address, uint256));
                Payments.sweepToken(token, recipient, minValue);
            } else if (commandType == FLAG_CT_WRAP_ETH) {
                (address recipient, uint256 amountMin) = abi.decode(state.buildInputs(indices), (address, uint256));
                Payments.wrapETH(recipient, amountMin);
            } else if (commandType == FLAG_CT_UNWRAP_WETH) {
                (address recipient, uint256 amountMin) = abi.decode(state.buildInputs(indices), (address, uint256));
                Payments.unwrapWETH9(recipient, amountMin);
            } else {
                revert('Invalid calltype');
            }

            if (!success) {
                if (outdata.length > 0) {
                    assembly {
                        outdata := add(outdata, 68)
                    }
                }
                revert ExecutionFailed({commandIndex: 0, message: outdata.length > 0 ? string(outdata) : 'Unknown'});
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 56), outdata);
            } else {
                state = state.writeOutputs(bytes1(command << 56), outdata);
            }
        }

        return state;
    }

    receive() external payable {
        if (msg.sender != Constants.WETH9) {
            revert ETHNotAccepted();
        }
    }
}
