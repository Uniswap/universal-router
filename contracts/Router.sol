// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './base/Dispatcher.sol';
import './libraries/Constants.sol';

contract Router is Dispatcher {
    error ExecutionFailed(uint256 commandIndex, bytes message);
    error ETHNotAccepted();
    error TransactionDeadlinePassed();
    error LengthMismatch();

    bytes1 internal constant FLAG_ALLOW_REVERT = 0x80;

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
    ) Dispatcher(permitPost, v2Factory, v3Factory, pairInitCodeHash, poolInitCodeHash) {}

    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param inputs The state elements that should be used for the input and output of commands
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
    {
        execute(commands, inputs);
    }

    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param inputs The state elements that should be used for the input and output of commands
    function execute(bytes calldata commands, bytes[] calldata inputs) public payable {
        bool success;
        bytes memory output;
        uint256 numCommands = commands.length;
        if (inputs.length != numCommands) revert LengthMismatch();

        // loop through all given commands, execute them and pass along outputs as defined
        for (uint256 commandIndex = 0; commandIndex < numCommands;) {
            bytes1 command = commands[commandIndex];
            uint256 commandType = uint256(uint8(command & FLAG_COMMAND_TYPE_MASK));

            bytes memory input = inputs[commandIndex];

            (success, output) = dispatch(commandType, input);

            if (!success && successRequired(command)) {
                revert ExecutionFailed({commandIndex: commandIndex, message: output});
            }

            unchecked {
                commandIndex++;
            }
        }
    }

    function successRequired(bytes1 command) internal pure returns (bool) {
        return command & FLAG_ALLOW_REVERT == 0;
    }

    receive() external payable {
        if (msg.sender != Constants.WETH9) {
            revert ETHNotAccepted();
        }
    }
}
