// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

struct RouterParameters {
    // Payment parameters
    address permit2;
    address weth9;
    // Uniswap swapping parameters
    address v2Factory;
    address v3Factory;
    bytes32 pairInitCodeHash;
    bytes32 poolInitCodeHash;
    address v4PoolManager;
    // Uniswap v3->v4 migration parameters
    address v3NFTPositionManager;
    address v4PositionManager;
}
