// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

// Command implementations
import {Dispatcher} from './base/Dispatcher.sol';
import {RouterParameters} from './base/RouterImmutables.sol';
import {PaymentsImmutables, PaymentsParameters} from './modules/PaymentsImmutables.sol';
import {UniswapImmutables, UniswapParameters} from './modules/uniswap/UniswapImmutables.sol';
import {Commands} from './libraries/Commands.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';

contract UniversalRouter is IUniversalRouter, Dispatcher {
    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(RouterParameters memory params)
        UniswapImmutables(
            UniswapParameters(params.v2Factory, params.v3Factory, params.pairInitCodeHash, params.poolInitCodeHash)
        )
        PaymentsImmutables(PaymentsParameters(params.permit2, params.weth9))
    {}

    /// @inheritdoc IUniversalRouter
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
    {
        execute(commands, inputs);
    }

    /// @inheritdoc Dispatcher
    function execute(bytes calldata commands, bytes[] calldata inputs) public payable override isNotLocked {
        bool success;
        bytes memory output;
        uint256 numCommands = commands.length;
        if (inputs.length != numCommands) revert LengthMismatch();

        // loop through all given commands, execute them and pass along outputs as defined
        for (uint256 commandIndex = 0; commandIndex < numCommands;) {
            bytes1 command = commands[commandIndex];

            bytes calldata input = inputs[commandIndex];

            (success, output) = dispatch(command, input);

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

    /// @notice To receive ETH from WETH
    receive() external payable {
        if (msg.sender != address(WETH9)) revert InvalidEthSender();
    }
}
