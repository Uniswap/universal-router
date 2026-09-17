// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployRobinhood is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73,
            v2Factory: 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f,
            v3Factory: 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x8366a39CC670B4001A1121B8F6A443A643e40951,
            v3NFTPositionManager: 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3,
            v4PositionManager: 0x58daec3116aae6D93017bAAea7749052E8a04fA7,
            // matches the live 2.1.1 deployment, which was built with no SpokePool.
            // An Across SpokePool does exist at 0xD29C85F15DF544bA632C9E25829fd29d767d7978
            // if enabling ChainedActions here is intended.
            spokePool: address(0)
        });

        unsupported = 0x7332D11BD10d18A04B119Cd4671a96f3148002c4;
    }
}
