// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployBSC is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c,
            v2Factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6,
            v3Factory: 0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF,
            v3NFTPositionManager: 0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613,
            v4PositionManager: 0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b
        });

        unsupported = 0x5302086A3a25d473aAbBd0356eFf8Dd811a4d89B;
    }
}
