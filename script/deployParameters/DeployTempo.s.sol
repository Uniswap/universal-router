// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployTempo is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: UNSUPPORTED_PROTOCOL,
            v2Factory: 0xf9EC577a4E45B5278BB7Cf60FCBc20c3acAef68f,
            v3Factory: 0x24a3d4757E330890A8b8978028c9e58E04611fd6,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x33620f62C5b9B2086dD6b62F4A297A9f30347029,
            v3NFTPositionManager: 0xb71C33f096CEabDC0229110e0d76a6382d01C633,
            v4PositionManager: 0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11,
            spokePool: UNSUPPORTED_PROTOCOL
        });

        unsupported = 0xBbBcC62853a5fA27b93d6Bab3E6F7ce841E25Df2;
    }
}
