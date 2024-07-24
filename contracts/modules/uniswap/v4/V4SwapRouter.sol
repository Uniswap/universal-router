// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {UniswapImmutables} from '../UniswapImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {V4Router} from '@uniswap/v4-periphery/src/V4Router.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';

/// @title Router for Uniswap v4 Trades
abstract contract V4SwapRouter is V4Router, Permit2Payments {
    constructor(address poolManager) V4Router(IPoolManager(poolManager)) {}

    function _pay(address token, address payer, address recipient, uint256 amount) internal override {
        // TODO map recipient ?? here or in periphery??
        payOrPermit2Transfer(token, payer, recipient, amount);
    }
}
