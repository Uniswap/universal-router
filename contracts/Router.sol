// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './modules/V2SwapRouter.sol';
import './modules/V3SwapRouter.sol';
import './modules/Payments.sol';
import './libraries/CommandBuilder.sol';

contract WeirollRouter is V2SwapRouter, V3SwapRouter {
    using CommandBuilder for bytes[];

    error ExecutionFailed(uint256 commandIndex, bytes message);
    error ETHNotAccepted();
    error TransactionDeadlinePassed();
    error InvalidCommandType(uint256 commandIndex);

    // Command Types
    uint256 constant FLAG_CT_PERMIT = 0x00;
    uint256 constant FLAG_CT_TRANSFER = 0x01;
    uint256 constant FLAG_CT_V3_SWAP_EXACT_IN = 0x02;
    uint256 constant FLAG_CT_V3_SWAP_EXACT_OUT = 0x03;
    uint256 constant FLAG_CT_V2_SWAP_EXACT_IN = 0x04;
    uint256 constant FLAG_CT_V2_SWAP_EXACT_OUT = 0x05;
    uint256 constant FLAG_CT_SEAPORT = 0x06;
    uint256 constant FLAG_CT_WRAP_ETH = 0x07;
    uint256 constant FLAG_CT_UNWRAP_WETH = 0x08;
    uint256 constant FLAG_CT_SWEEP = 0x09;

    uint8 constant FLAG_CT_MASK = 0x0f;
    uint8 constant FLAG_TUPLE_RETURN = 0x40;
    uint8 constant COMMAND_INDICES_OFFSET = 8;
    // the first 32 bytes of a dynamic parameters specify the param length
    uint8 constant PARAMS_LENGTH_OFFSET = 32;

    address immutable permitPost;

    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(address _permitPost) {
        permitPost = _permitPost;
    }

    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param state The state elements that should be used for the input and output of commands
    function execute(uint256 deadline, bytes memory commands, bytes[] memory state)
        public
        payable
        checkDeadline(deadline)
        returns (bytes[] memory)
    {
        bytes8 command;
        uint8 commandType;
        uint8 flags;
        bytes8 indices;
        bool success = true;

        bytes memory outdata;
        uint256 maxIteration;
        unchecked {
            maxIteration = commands.length + PARAMS_LENGTH_OFFSET;
        }

        for (uint256 i = PARAMS_LENGTH_OFFSET; i < maxIteration;) {
            assembly {
                command := mload(add(commands, i))
            }

            flags = uint8(bytes1(command));
            commandType = flags & FLAG_CT_MASK;
            indices = bytes8(uint64(command) << COMMAND_INDICES_OFFSET);

            bytes memory inputs = state.buildInputs(indices);
            if (commandType == FLAG_CT_PERMIT) {
                // state[state.length] = abi.encode(msg.sender);
                // (success, outdata) = permitPost.call(state[0]);
                // bytes memory inputs = state.build(bytes4(0), indices);
                // (address some, address parameters, uint256 forPermit) = abi.decode(inputs, (address, address, uint));
                //
                // permitPost.permitWithNonce(msg.sender, some, parameters, forPermit);
            } else if (commandType == FLAG_CT_TRANSFER) {
                (address token, address recipient, uint256 value) = abi.decode(inputs, (address, address, uint256));
                Payments.pay(token, recipient, value);
            } else if (commandType == FLAG_CT_V2_SWAP_EXACT_IN) {
                (uint256 amountOutMin, address[] memory path, address recipient) =
                    abi.decode(inputs, (uint256, address[], address));
                outdata = abi.encode(v2SwapExactInput(amountOutMin, path, recipient));
            } else if (commandType == FLAG_CT_V2_SWAP_EXACT_OUT) {
                (uint256 amountOut, uint256 amountInMax, address[] memory path, address recipient) =
                    abi.decode(inputs, (uint256, uint256, address[], address));
                outdata = abi.encode(v2SwapExactOutput(amountOut, amountInMax, path, recipient));
            } else if (commandType == FLAG_CT_V3_SWAP_EXACT_IN) {
                (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                    abi.decode(inputs, (address, uint256, uint256, bytes));
                outdata = abi.encode(v3SwapExactInput(recipient, amountIn, amountOutMin, path));
            } else if (commandType == FLAG_CT_V3_SWAP_EXACT_OUT) {
                (address recipient, uint256 amountIn, uint256 amountOutMin, bytes memory path) =
                    abi.decode(inputs, (address, uint256, uint256, bytes));
                outdata = abi.encode(v3SwapExactOutput(recipient, amountIn, amountOutMin, path));
            } else if (commandType == FLAG_CT_SEAPORT) {
                (uint256 value, bytes memory data) = abi.decode(inputs, (uint256, bytes));
                (success, outdata) = Constants.SEAPORT.call{value: value}(data);
            } else if (commandType == FLAG_CT_SWEEP) {
                (address token, address recipient, uint256 minValue) = abi.decode(inputs, (address, address, uint256));
                Payments.sweepToken(token, recipient, minValue);
            } else if (commandType == FLAG_CT_WRAP_ETH) {
                (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                Payments.wrapETH(recipient, amountMin);
            } else if (commandType == FLAG_CT_UNWRAP_WETH) {
                (address recipient, uint256 amountMin) = abi.decode(inputs, (address, uint256));
                Payments.unwrapWETH9(recipient, amountMin);
            } else {
                revert InvalidCommandType((i - 32)/8);
            }

            if (!success) {
                revert ExecutionFailed({commandIndex: (i - 32)/8, message: outdata});
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 56), outdata);
            } else {
                state = state.writeOutputs(bytes1(command << 56), outdata);
            }

            unchecked {
                i += 8;
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
