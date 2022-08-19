// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './base/Payments.sol';
import './base/weiroll/CommandBuilder.sol';

contract RouterWeirollVM is Payments {
    error NotGreaterOrEqual(uint256 big, uint256 smol);
    error NotEqual(uint256 equal1, uint256 equal2);
    error ExecutionFailed(uint256 command_index, address target, string message);

    using CommandBuilder for bytes[];

    bytes4 constant TRANSFER_FUNCTION_SEL     = 0x9d61d234;
    bytes4 constant NFT_TRANSFER_FUNCTION_SEL = 0x9d61d234;
    bytes4 constant PERMIT_FUNCTION_SEL       = 0x6a8769fc;
    bytes4 constant V2SWAP_FUNCTION_SEL       = 0x778769fd;
    bytes4 constant V3SWAP_FUNCTION_SEL       = 0xda3469aa;

    uint256 constant FLAG_CT_PERMIT    = 0x00;
    uint256 constant FLAG_CT_V2SWAP    = 0x01;
    uint256 constant FLAG_CT_V3SWAP    = 0x02;
    uint256 constant FLAG_CT_TRANSFER  = 0x03;
    uint256 constant FLAG_CT_CHECK_AMT = 0x04;
    uint256 constant FLAG_CT_MASK      = 0x07;

    uint256 constant FLAG_EXTENDED_COMMAND = 0x80;
    uint256 constant FLAG_TUPLE_RETURN     = 0x40;
    uint256 constant SHORT_COMMAND_FILL    = 0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    address immutable permitPostAddress;

    constructor(address permitPost) Payments(permitPost) {
        permitPostAddress = permitPost;
    }

    function execute(bytes32[] calldata commands, bytes[] memory state) external returns (bytes[] memory) {
        bytes32 command;
        uint256 commandType;
        uint256 flags;
        bytes32 indices;

        bool success;
        bytes memory outdata;

        for (uint256 i; i < commands.length; i++) {
            command = commands[i];
            flags = uint256(uint8(bytes1(command << 32)));
            commandType = flags & FLAG_CT_MASK;

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                indices = commands[i++];
            } else {
                indices = bytes32(uint256(command << 40) | SHORT_COMMAND_FILL);
            }

            if (commandType == FLAG_CT_PERMIT) {
                state[state.length] = abi.encode(msg.sender);
                (success, outdata) = permitPostAddress.call(state.buildInputs(PERMIT_FUNCTION_SEL, indices));
            } else if (commandType == FLAG_CT_TRANSFER) {
                bytes memory inputs = state.buildInputs(bytes4(0), indices);
                (address token, address payer, address recipient, uint256 value) = abi.decode(inputs, (address, address, address, uint256));
                pay(token, payer, recipient, value);
            } else if (commandType == FLAG_CT_V3SWAP) {
                (success, outdata) = address(uint160(uint256(command))).call(
                    state.buildInputs(V3SWAP_FUNCTION_SEL, indices)
                );
            } else if (commandType == FLAG_CT_V2SWAP) {
                (success, outdata) = address(uint160(uint256(command))).call(
                    state.buildInputs(V2SWAP_FUNCTION_SEL, indices)
                );
            } else if (commandType == FLAG_CT_CHECK_AMT) {
              // checkAmountGTE(state.buildCheckAmountsInputs(indices));
            } else {
                revert('Invalid calltype');
            }
        }

        if (!success) {
            if (outdata.length > 0) {
                assembly {
                    outdata := add(outdata, 68)
                }
            }
            revert ExecutionFailed({
                command_index: 0,
                target: address(uint160(uint256(command))),
                message: outdata.length > 0 ? string(outdata) : 'Unknown'
            });
        }

        if (flags & FLAG_TUPLE_RETURN != 0) {
            state.writeTuple(bytes1(command << 88), outdata);
        } else {
            state = state.writeOutputs(bytes1(command << 88), outdata);
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

    function myNewFunction() external pure returns (uint256 num) {
      return 5;
    }
}
