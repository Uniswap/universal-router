// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeploySoneium is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4200000000000000000000000000000000000006,
            v2Factory: UNSUPPORTED_PROTOCOL,
            v3Factory: UNSUPPORTED_PROTOCOL,
            pairInitCodeHash: BYTES32_ZERO,
            poolInitCodeHash: BYTES32_ZERO,
            v4PoolManager: 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32,
            v3NFTPositionManager: 0x8702463e73f74d0b6765aBceb314Ef07aCb92650,
            v4PositionManager: 0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566
        });

        unsupported = 0x8702463e73f74d0b6765aBceb314Ef07aCb92650;
    }
}
