// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './base/Commands.sol';

// Helper Libraries
import './libraries/CommandBuilder.sol';
import './libraries/CommandLib.sol';
import './libraries/Constants.sol';

import {ERC721} from 'solmate/src/tokens/ERC721.sol';

contract Router is Commands {
    using CommandBuilder for bytes[];
    using CommandLib for bytes;

    error ExecutionFailed(uint256 commandIndex, bytes message);
    error ETHNotAccepted();
    error TransactionDeadlinePassed();

    uint8 constant FLAG_ALLOW_REVERT = 0x80;

    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(
        address permitPost,
        address v2Factory,
        address v3Factory,
        bytes32 pairInitCodeHash,
        bytes32 poolInitCodeHash
    ) Commands(permitPost, v2Factory, v3Factory, pairInitCodeHash, poolInitCodeHash) {}

    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param state The state elements that should be used for the input and output of commands
    function execute(uint256 deadline, bytes memory commands, bytes[] memory state)
        public
        payable
        checkDeadline(deadline)
        returns (bytes[] memory)
    {
        bool success;
        bytes memory output;
        uint256 numCommands = commands.numCommands();

        // loop through all given commands, execute them and pass along outputs as defined
        for (uint256 commandIndex = 0; commandIndex < numCommands;) {
            (uint8 flags, uint256 commandType, bytes8 indices) = commands.decodeCommand(commandIndex);

            bytes memory inputs = state.buildInputs(indices);

            (success, output) = dispatch(commandType, inputs);

            if (!success && successRequired(flags)) {
                revert ExecutionFailed({commandIndex: commandIndex, message: output});
            }
            unchecked {
                commandIndex++;
            }
        }
        return state;
    }

    function successRequired(uint8 flags) internal pure returns (bool) {
        return flags & FLAG_ALLOW_REVERT == 0;
    }

    receive() external payable {
        if (msg.sender != Constants.WETH9) {
            revert ETHNotAccepted();
        }
    }
}
