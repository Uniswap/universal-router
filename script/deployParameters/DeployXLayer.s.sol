// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployXLayer is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xe538905cf8410324e03A5A23C1c177a474D59b2b,
            v2Factory: 0xDf38F24fE153761634Be942F9d859f3DBA857E95,
            v3Factory: 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32,
            v3NFTPositionManager: 0x315e413A11AB0df498eF83873012430ca36638Ae,
            v4PositionManager: 0xcF1EAFC6928dC385A342E7C6491d371d2871458b,
            spokePool: UNSUPPORTED_PROTOCOL
        });

        unsupported = 0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f;
    }
}
