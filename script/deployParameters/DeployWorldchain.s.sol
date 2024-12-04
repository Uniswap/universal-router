// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployWorldchain is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x0000000000000000000000000000000000000000,
            weth9: 0x0000000000000000000000000000000000000000,
            v2Factory: 0x0000000000000000000000000000000000000000,
            v3Factory: 0x0000000000000000000000000000000000000000,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            v4PoolManager: 0x0000000000000000000000000000000000000000,
            v3NFTPositionManager: 0x0000000000000000000000000000000000000000,
            v4PositionManager: 0x0000000000000000000000000000000000000000
        });
    }
}
