// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {BaseDeployBootstrap} from './BaseDeployBootstrap.sol';

/// @notice deployment bootstrap for Polygon
contract PolygonDeployBootstrap is BaseDeployBootstrap {
    /// @dev WETH9 address on Polygon
    address public constant override WETH9 = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    /// @dev Seaport address on Polygon
    address public constant override SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of the UniswapV3Factory on Polygon
    address public constant override UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    constructor(address permit2) BaseDeployBootstrap(permit2) {}
}
