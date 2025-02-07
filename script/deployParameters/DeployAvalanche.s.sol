// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployAvalanche is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7,
            v2Factory: 0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C,
            v3Factory: 0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x06380C0e0912312B5150364B9DC4542BA0DbBc85,
            v3NFTPositionManager: 0x655C406EBFa14EE2006250925e54ec43AD184f8B,
            v4PositionManager: 0xB74b1F14d2754AcfcbBe1a221023a5cf50Ab8ACD
        });

        unsupported = 0x5302086A3a25d473aAbBd0356eFf8Dd811a4d89B;
    }
}
