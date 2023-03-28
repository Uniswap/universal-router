// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployPolygon is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270,
            seaport: 0x00000000006c3852cbEf3e08E8dF289169EdE581,
            seaportv1_4: 0x00000000000001ad428e4906aE43D8F9852d0dD6,
            nftxZap: UNSUPPORTED_PROTOCOL,
            x2y2: UNSUPPORTED_PROTOCOL,
            foundation: UNSUPPORTED_PROTOCOL,
            sudoswap: UNSUPPORTED_PROTOCOL,
            nft20Zap: UNSUPPORTED_PROTOCOL,
            cryptopunks: UNSUPPORTED_PROTOCOL,
            looksRare: UNSUPPORTED_PROTOCOL,
            routerRewardsDistributor: UNSUPPORTED_PROTOCOL,
            looksRareRewardsDistributor: UNSUPPORTED_PROTOCOL,
            looksRareToken: UNSUPPORTED_PROTOCOL,
            v2Factory: UNSUPPORTED_PROTOCOL,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            pairInitCodeHash: BYTES32_ZERO,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
        });

        unsupported = 0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B;
    }
}
