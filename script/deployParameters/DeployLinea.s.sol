// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployLinea is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f,
            v2Factory: 0x114A43DF6C5f54EBB8A9d70Cd1951D3dD68004c7,
            v3Factory: 0x31FAfd4889FA1269F7a13A66eE0fB458f27D72A9,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x248083Fb965359d82b06C1F5322480Dcfc1AD857,
            permissionsAdapterFactory: address(0), // ToDo: Add permissions adapter factory
            v3NFTPositionManager: 0x4615C383F85D0a2BbED973d83ccecf5CB7121463,
            v4PositionManager: 0xdDCAD5775B2816a87495f207731b3571D7EE3c76,
            spokePool: 0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75
        });

        unsupported = 0x59Eb58642D7f66517EF357B2d3F515F24bcA588d;
    }
}
