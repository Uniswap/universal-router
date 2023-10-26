// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';

contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {

}