// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployOptimism is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4200000000000000000000000000000000000006,
            seaport: 0x00000000006c3852cbEf3e08E8dF289169EdE581,
            seaportv1_4: 0x00000000000001ad428e4906aE43D8F9852d0dD6,
            nftxZap: 0x0000000000000000000000000000000000000000,
            x2y2: 0x0000000000000000000000000000000000000000,
            foundation: 0x0000000000000000000000000000000000000000,
            sudoswap: 0x0000000000000000000000000000000000000000,
            nft20Zap: 0x0000000000000000000000000000000000000000,
            cryptopunks: 0x0000000000000000000000000000000000000000,
            looksRare: 0x0000000000000000000000000000000000000000,
            routerRewardsDistributor: 0x0000000000000000000000000000000000000000,
            looksRareRewardsDistributor: 0x0000000000000000000000000000000000000000,
            looksRareToken: 0x0000000000000000000000000000000000000000,
            v2Factory: 0x0000000000000000000000000000000000000000,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            pairInitCodeHash: 0x0000000000000000000000000000000000000000000000000000000000000000,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
        });

        unsupported = 0x40d51104Da22E3e77b683894E7e3E12e8FC61E65;
    }
}