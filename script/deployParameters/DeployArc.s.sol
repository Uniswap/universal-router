// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployArc is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            // Arc has no canonical WETH
            weth9: UNSUPPORTED_PROTOCOL,
            v2Factory: 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba,
            v3Factory: 0xf0db7b58379503491d857dB50AC9ece64c653918,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x8366a39CC670B4001A1121B8F6A443A643e40951,
            permissionsAdapterFactory: address(0), // ToDo: Add permissions adapter factory
            v3NFTPositionManager: 0x39654A85A4C05127f5Fd6ED22CAeC077A0fB1377,
            v4PositionManager: 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B,
            // no Across SpokePool on Arc
            spokePool: UNSUPPORTED_PROTOCOL
        });

        unsupported = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    }
}
