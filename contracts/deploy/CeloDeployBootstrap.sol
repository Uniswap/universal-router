// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {BaseDeployBootstrap} from './BaseDeployBootstrap.sol';

/// @notice deployment bootstrap for Celo
contract CeloDeployBootstrap is BaseDeployBootstrap {
    /// @dev WETH9 address on Celo
    /// @dev note celo does not have WETH as their native token supports the ERC20 interface
    address public constant override WETH9 = 0x0000000000000000000000000000000000000000;

    /// @dev The address of the UniswapV3Factory on Celo
    address public constant override UNISWAP_V3_FACTORY = 0xAfE208a311B21f13EF87E33A90049fC17A7acDEc;

    constructor(address permit2) BaseDeployBootstrap(permit2) {}
}
