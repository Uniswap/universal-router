// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployMegaETH is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4200000000000000000000000000000000000006,
            v2Factory: 0xbf56488c857A881ae7e3BED27Cf99c10A7Ab7e50,
            v3Factory: 0x3a5F0CD7d62452b7f899B2A5758BFa57be0dE478,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0xaCB7e78fa05D562e0A5D3089ec896D57D057d38E,
            permissionsAdapterFactory: address(0), // ToDo: Add permissions adapter factory
            v3NFTPositionManager: 0xCDc86e98184e96436F733a8Bf31BD4F0214E6D7d,
            v4PositionManager: 0x9AE0921E981AAa7308f176F8d4F9129b9247C89D,
            // no Across SpokePool on MegaETH
            spokePool: UNSUPPORTED_PROTOCOL
        });

        unsupported = 0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40;
    }
}
