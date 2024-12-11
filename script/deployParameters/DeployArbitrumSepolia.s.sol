// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployArbitrumSepolia is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73,
            v2Factory: UNSUPPORTED_PROTOCOL,
            v3Factory: 0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e,
            pairInitCodeHash: BYTES32_ZERO,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317,
            v3NFTPositionManager: 0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65,
            v4PositionManager: 0xAc631556d3d4019C95769033B5E719dD77124BAc
        });

        unsupported = 0xDC0e6B43312B508e431735bc4d97FBbBf3293148;
    }
}
