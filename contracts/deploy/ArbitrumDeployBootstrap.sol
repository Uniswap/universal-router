// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {BaseDeployBootstrap} from './BaseDeployBootstrap.sol';

/// @notice deployment bootstrap for Arbitrum
contract ArbitrumDeployBootstrap is BaseDeployBootstrap {
    /// @dev WETH9 address on Arbitrum
    address public constant override WETH9 = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    /// @dev Seaport address on Arbitrum
    address public constant override SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of NFTX zap contract on Arbitrum for interfacing with vaults
    /// @dev https://docs.nftx.io/smart-contracts/contract-addresses
    address public constant override NFTX_ZAP = 0x66f26E38bD50FD52A50da8E87E435f04f98001B7;

    /// @dev The address of the UniswapV3Factory on Arbitrum
    address public constant override UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    constructor(address permit2) BaseDeployBootstrap(permit2) {}
}
