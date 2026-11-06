// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

/// @notice Elysium mainnet (chain id 99901). Addresses from Uniswap/contracts deployments/json/99901.json.
contract DeployElysium is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            // WHYPE, the canonical wrapped native on Elysium
            weth9: 0xbA876237B0F021A6c6D852d6c26E107997cC5E81,
            v2Factory: 0xBbBcC62853a5fA27b93d6Bab3E6F7ce841E25Df2,
            v3Factory: 0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1,
            permissionsAdapterFactory: 0xdCD9f4e8972F619B325B0C3109412dFC4D184734,
            v3NFTPositionManager: 0xF025e0Fe9E331A0eF05c2ad3C4E9C64b625cda6f,
            v4PositionManager: 0x1d1C51b9d07fD27d36412A2b66CC23D19Eb3E518,
            // no Across SpokePool on Elysium
            spokePool: UNSUPPORTED_PROTOCOL
        });

        // deployed by Uniswap/contracts Deploy-all as its first transaction
        unsupported = 0x8702463e73f74d0b6765aBceb314Ef07aCb92650;
    }
}
