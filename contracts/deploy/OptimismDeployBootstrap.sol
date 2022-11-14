// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {BaseDeployBootstrap} from './BaseDeployBootstrap.sol';

/// @notice deployment bootstrap for Optimism
contract OptimismDeployBootstrap is BaseDeployBootstrap {
    /// @dev WETH9 address on Optimism
    address public constant override WETH9 = 0x4200000000000000000000000000000000000006;

    /// @dev Seaport address on Optimism
    address public constant override SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of the UniswapV3Factory on Optimism
    address public constant override UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    constructor(address permit2) BaseDeployBootstrap(permit2) {}
}
