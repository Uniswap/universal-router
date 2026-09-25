// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

/// @notice HyperEVM mainnet (chain id 999). Addresses from Uniswap/contracts deployments/json/999.json.
contract DeployHyperEVM is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            // WHYPE, the canonical wrapped native on HyperEVM
            weth9: 0x5555555555555555555555555555555555555555,
            v2Factory: 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba,
            v3Factory: 0xf0db7b58379503491d857dB50AC9ece64c653918,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x12D4Fd9C5DeDd00ab8a0bCe2CF0167bbf94b6B1F,
            permissionsAdapterFactory: 0x8702463e73f74d0b6765aBceb314Ef07aCb92650,
            v3NFTPositionManager: 0x39654A85A4C05127f5Fd6ED22CAeC077A0fB1377,
            v4PositionManager: 0x0d7Ab5B3db668128Aff6F70C4eBC71D7d4DA9bf9,
            // Across SpokePool on HyperEVM (chainId()=999, wrappedNativeToken()=WHYPE)
            spokePool: 0x35E63eA3eb0fb7A3bc543C71FB66412e1F6B0E04
        });

        // deployed alongside the 2.1.2 router on 2026-09-17
        unsupported = 0xEEE3Aa3c0d6D6f4E702748DeAcb42991A0094BcF;
    }
}
