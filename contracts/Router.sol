// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './modules/V2SwapRouter.sol';

import './base/Payments.sol';
import './base/weiroll/CommandBuilder.sol';

contract WeirollRouter is Payments, V2SwapRouter {
    using CommandBuilder for bytes[];

    error NotGreaterOrEqual(uint256 big, uint256 smol);
    error NotEqual(uint256 equal1, uint256 equal2);
    error ExecutionFailed(uint256 command_index, string message);

    uint256 constant FLAG_CT_PERMIT = 0x00;
    uint256 constant FLAG_CT_TRANSFER = 0x01;
    uint256 constant FLAG_CT_V3SWAP = 0x02;
    uint256 constant FLAG_CT_V2SWAP = 0x03;
    uint256 constant FLAG_CT_CHECK_AMT = 0x04;
    uint256 constant FLAG_CT_MASK = 0x0f;

    uint256 constant FLAG_EXTENDED_COMMAND = 0x80;
    uint256 constant FLAG_TUPLE_RETURN = 0x40;
    uint256 constant SHORT_COMMAND_FILL = 0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    address immutable permitPostAddress;

    constructor(address permitPost) Payments(permitPost) {
        permitPostAddress = permitPost;
    }

    function execute(bytes8[] calldata commands, bytes[] memory state) external returns (bytes[] memory) {
        bytes32 command;
        uint256 commandType;
        uint256 flags;
        bytes32 indices;
        bool success;

        bytes memory outdata;

        for (uint256 i; i < commands.length; i++) {
            success = true;
            command = commands[i];
            flags = uint256(uint8(bytes1(command)));
            commandType = flags & FLAG_CT_MASK;

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                indices = commands[i++];
            } else {
                indices = bytes32(uint256(command << 8) | SHORT_COMMAND_FILL);
            }

            if (commandType == FLAG_CT_PERMIT) {
                // state[state.length] = abi.encode(msg.sender);
                // (success, outdata) = permitPostAddress.call(state[0]);
                // bytes memory inputs = state.build(bytes4(0), indices);
                // (address some, address parameters, uint256 forPermit) = abi.decode(inputs, (address, address, uint));
                //
                // permitPost.permitWithNonce(msg.sender, some, parameters, forPermit);
            } else if (commandType == FLAG_CT_TRANSFER) {
                bytes memory inputs = state.buildInputs(indices);
                (address token, address payer, address recipient, uint256 value) = abi.decode(
                    inputs,
                    (address, address, address, uint256)
                );
                pay(token, payer, recipient, value);
            } else if (commandType == FLAG_CT_CHECK_AMT) {
                (uint256 amountA, uint256 amountB) = abi.decode(state.buildInputs(indices), (uint256, uint256));
                checkAmountGTE(amountA, amountB);
            } else if (commandType == FLAG_CT_V2SWAP) {
                bytes memory inputs = state.buildInputs(indices);
                (uint256 amountIn, uint256 amountOutMin, address[] memory path, address recipient) = abi.decode(
                    inputs,
                    (uint256, uint256, address[], address)
                );
                outdata = abi.encode(swapV2(amountIn, amountOutMin, path, recipient));
            } else {
                revert('Invalid calltype');
            }

            if (!success) {
                if (outdata.length > 0) {
                    assembly {
                        outdata := add(outdata, 68)
                    }
                }
                revert ExecutionFailed({command_index: 0, message: outdata.length > 0 ? string(outdata) : 'Unknown'});
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 56), outdata);
            } else {
                state = state.writeOutputs(bytes1(command << 56), outdata);
            }
        }

        return state;
    }

    // could combine with enum for operation.
    function checkAmountGTE(uint256 a, uint256 b) private pure {
        if (a < b) revert NotGreaterOrEqual(a, b);
    }

    function checkAmountEQ(uint256 a, uint256 b) private pure {
        if (a != b) revert NotEqual(a, b);
    }
}
