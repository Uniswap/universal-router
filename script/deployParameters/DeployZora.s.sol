// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployWorldchain is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022d473030f116ddee9f6b43ac78ba3,
            weth9: 0x4200000000000000000000000000000000000006,
            v2Factory: 0x0F797dC7efaEA995bB916f268D919d0a1950eE3C,
            v3Factory: 0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: address(0),
            v3NFTPositionManager: 0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb,
            v4PositionManager: address(0)
        });
    }
}
