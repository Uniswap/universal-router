// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {UniswapParameters, UniswapImmutables} from '../modules/uniswap/UniswapImmutables.sol';
import {PaymentsParameters, PaymentsImmutables} from '../modules/PaymentsImmutables.sol';
import {NFTParameters, NFTImmutables} from '../modules/NFTImmutables.sol';

struct RouterParameters {
    address permit2;
    address weth9;
    address seaportV1_5;
    address seaportV1_4;
    address openseaConduit;
    address nftxZap;
    address x2y2;
    address foundation;
    address sudoswap;
    address elementMarket;
    address nft20Zap;
    address cryptopunks;
    address looksRareV2;
    address routerRewardsDistributor;
    address looksRareRewardsDistributor;
    address looksRareToken;
    address v2Factory;
    address v3Factory;
    bytes32 pairInitCodeHash;
    bytes32 poolInitCodeHash;
}

/// @title Router Immutable Storage contract
/// @notice Used along with the `RouterParameters` struct for ease of cross-chain deployment
contract RouterImmutables is PaymentsImmutables, UniswapImmutables, NFTImmutables {
    constructor(RouterParameters memory params)
        UniswapImmutables(
            UniswapParameters(params.v2Factory, params.v3Factory, params.pairInitCodeHash, params.poolInitCodeHash)
        )
        PaymentsImmutables(
            PaymentsParameters(params.permit2, params.weth9, params.openseaConduit, params.sudoswap)
        )
        NFTImmutables(
            NFTParameters(
                params.seaportV1_5,
                params.seaportV1_4,
                params.nftxZap,
                params.x2y2,
                params.foundation,
                params.sudoswap,
                params.elementMarket,
                params.nft20Zap,
                params.cryptopunks,
                params.looksRareV2,
                params.routerRewardsDistributor,
                params.looksRareRewardsDistributor,
                params.looksRareToken
            )
        )
    {}
}
