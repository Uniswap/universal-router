// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import './base/Dispatcher.sol';
import './base/RewardsCollector.sol';
import './base/RouterImmutables.sol';
import './libraries/Commands.sol';
import './interfaces/IRouter.sol';
import './interfaces/IDeployBootstrap.sol';

contract Router is RouterImmutables, RewardsCollector, Dispatcher, IRouter {
    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(address deployBootstrap) RouterImmutables(IDeployBootstrap(deployBootstrap)) {}

    /// @inheritdoc IRouter
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
    {
        execute(commands, inputs);
    }

    /// @inheritdoc IRouter
    function execute(bytes calldata commands, bytes[] calldata inputs) public payable {
        bool success;
        bytes memory output;
        uint256 numCommands = commands.length;
        if (inputs.length != numCommands) revert LengthMismatch();

        // loop through all given commands, execute them and pass along outputs as defined
        for (uint256 commandIndex = 0; commandIndex < numCommands;) {
            bytes1 command = commands[commandIndex];
            uint256 commandType = uint8(command & Commands.COMMAND_TYPE_MASK);

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
        return command & Commands.FLAG_ALLOW_REVERT == 0;
    }

    receive() external payable {}
}
