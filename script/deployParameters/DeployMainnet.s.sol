// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployMainnet is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
            seaportV1_5: 0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC,
            seaportV1_4: 0x00000000000001ad428e4906aE43D8F9852d0dD6,
            openseaConduit: 0x1E0049783F008A0085193E00003D00cd54003c71,
            nftxZap: 0x941A6d105802CCCaa06DE58a13a6F49ebDCD481C,
            x2y2: 0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3,
            foundation: 0xcDA72070E455bb31C7690a170224Ce43623d0B6f,
            sudoswap: 0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329,
            elementMarket: 0x20F780A973856B93f63670377900C1d2a50a77c4,
            nft20Zap: 0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0,
            cryptopunks: 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB,
            looksRareV2: 0x0000000000E655fAe4d56241588680F86E3b2377,
            routerRewardsDistributor: 0xea37093ce161f090e443f304e1bF3a8f14D7bb40,
            looksRareRewardsDistributor: 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72,
            looksRareToken: 0xf4d2888d29D722226FafA5d9B24F9164c092421E,
            v2Factory: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
        });

        unsupported = 0x76D631990d505E4e5b432EEDB852A60897824D68;
    }
}
