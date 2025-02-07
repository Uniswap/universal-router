// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeploySepolia is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14,
            v2Factory: 0xB7f907f7A9eBC822a80BD25E224be42Ce0A698A0,
            v3Factory: 0x0227628f3F023bb0B980b67D528571c95c6DaC1c,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0xD24d4e867FDA1238B5Fa035Fa8aB731d41c4A3ed,
            v3NFTPositionManager: 0x1238536071E1c677A632429e3655c799b22cDA52,
            v4PositionManager: 0xc9BAAaAE1C3CA0263336f0a05C1969706Df8338A
        });

        unsupported = 0x5302086A3a25d473aAbBd0356eFf8Dd811a4d89B;
    }
}
