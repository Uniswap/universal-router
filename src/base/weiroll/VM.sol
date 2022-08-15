// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "./CommandBuilder.sol";
import "../RouterCallbacks.sol";


abstract contract VM is RouterCallbacks {
    using CommandBuilder for bytes[];


    bytes4 constant TRANSFER_FUNCTION_SIG = 0x9d61d234;

    uint256 constant FLAG_CT_UNISWAP_V3     = 0x00;
    uint256 constant FLAG_CT_UNISWAP_V2     = 0x01;
    uint256 constant FLAG_CT_SEAPORT        = 0x02;
    uint256 constant FLAG_CT_TRANSFER       = 0x03;
    uint256 constant FLAG_CT_TRANSFER_FROM  = 0x04;
    uint256 constant FLAG_CT_PERMIT         = 0x05;
    uint256 constant FLAG_CT_CHECK_AMT      = 0x06
    uint256 constant FLAG_CT_MASK           = 0x07;

    uint256 constant FLAG_EXTENDED_COMMAND  = 0x80;
    uint256 constant FLAG_TUPLE_RETURN      = 0x40;

    uint256 constant SHORT_COMMAND_FILL = 0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    address immutable uniswapV3Address;
    address immutable uniswapV2Address;
    address immutable openseaAddress;
    address immutable permitPost;

    error ExecutionFailed(
        uint256 command_index,
        address target,
        string message
    );

    constructor(address uniswapV3, address uniswapV2, address opensea, address permitPost) {
       uniswapV3Address = uniswapV3;
       uniswapV2Address = uniswapV2;
       openseaAddress   = opensea;
       permitPostAddress = permitPost;
    }

    function _execute(bytes32[] calldata commands, bytes[] memory state)
      internal returns (bytes[] memory)
    {
        bytes32 command;
        uint256 commandType;
        uint256 flags;
        bytes32 indices;

        bool success;
        bytes memory outdata;

        uint256 commandsLength = commands.length;
        for (uint256 i; i < commandsLength; i=_uncheckedIncrement(i)) {
            command = commands[i];
            flags = uint256(uint8(bytes1(command << 32)));

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                indices = commands[i++];
            } else {
                indices = bytes32(uint256(command << 40) | SHORT_COMMAND_FILL);
            }

            commandType = flags & FLAG_CT_MASK;

            if (commandType == FLAG_CT_UNISWAP_V3) {
                (success, outdata) = uniswapV3Address.call(
                    // inputs
                    state.buildInputs(
                        //selector
                        bytes4(command),
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_UNISWAP_V2) {
                (success, outdata) = uniswapV2Address.call(
                    // inputs
                    state.buildInputs(
                        //selector
                        bytes4(command),
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_SEAPORT) {
                (success, outdata) = openseaAddress.call(
                    // inputs
                    state.buildInputs(
                        //selector
                        bytes4(command),
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_TRANSFER) {
                 address(uint160(uint256(command))).pay(
                    abi.decode()
                    state.buildInputs(
                        //selector
                        TRANSFER_FUNCTION_SIG,
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_TRANSFER_FROM) {
                 (success, outdata) = address(uint160(uint256(command))).call( // target
                    // inputs
                    state.buildInputs(
                        //selector
                        TRANSFER_FUNCTION_SIG,
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_PERMIT) {
                 (success, outdata) = address(uint160(uint256(command))).call( // target
                    // inputs
                    state.buildInputs(
                        //selector
                        TRANSFER_FUNCTION_SIG,
                        indices
                    )
                );
            } else if (commandType == FLAG_CT_CHECK_AMT) {

            } else {
                revert("Invalid calltype");
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
                    message: outdata.length > 0 ? string(outdata) : "Unknown"
                });
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 88), outdata);
            } else {
                state = state.writeOutputs(bytes1(command << 88), outdata);
            }
        }
        return state;
    }

    function _uncheckedIncrement(uint256 i) private pure returns(uint256) {
        unchecked {++i;}
        return i;
    }
}
