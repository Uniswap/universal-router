// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {V4Router} from 'v4-periphery/contracts/V4Router.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';

contract V4SwapRouter is V4Router {
    constructor(address _poolManager) V4Router(IPoolManager(_poolManager)) {}

    function _pay(address token, address payer, address recipient, uint256 amount) internal override {}
}
