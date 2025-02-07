// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployOptimism is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4200000000000000000000000000000000000006,
            v2Factory: 0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x9a13F98Cb987694C9F086b1F5eB990EeA8264Ec3,
            v3NFTPositionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88,
            v4PositionManager: 0x3C3Ea4B57a46241e54610e5f022E5c45859A1017
        });

        unsupported = 0x40d51104Da22E3e77b683894E7e3E12e8FC61E65;
    }
}
