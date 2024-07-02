// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

struct RouterParameters {
    address permit2;
    address weth9;
    address v2Factory;
    address v3Factory;
    address v4PoolManager;
    bytes32 pairInitCodeHash;
    bytes32 poolInitCodeHash;
}
