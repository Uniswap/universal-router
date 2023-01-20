// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {Dispatcher} from './base/Dispatcher.sol';
import {RewardsCollector} from './base/RewardsCollector.sol';
import {RouterParameters, RouterImmutables} from './base/RouterImmutables.sol';
import {Constants} from './libraries/Constants.sol';
import {Commands} from './libraries/Commands.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';
import {ReentrancyLock} from './base/ReentrancyLock.sol';

contract UniversalRouter is RouterImmutables, IUniversalRouter, Dispatcher, RewardsCollector, ReentrancyLock {
    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    constructor(RouterParameters memory params) RouterImmutables(params) {}

    /// @inheritdoc IUniversalRouter
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
    {
        execute(commands, inputs);
    }

    /// @inheritdoc IUniversalRouter
    function execute(bytes calldata commands, bytes[] calldata inputs) public payable isNotLocked {
        _execute(commands, inputs);
    }

    // To receive ETH from WETH and NFT protocols
    receive() external payable {}
}
