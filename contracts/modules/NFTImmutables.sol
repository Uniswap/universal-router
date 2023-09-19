// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

struct NFTParameters {
    address seaportV1_5;
    address seaportV1_4;
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
}

contract NFTImmutables {
    /// @dev Seaport 1.5 address
    address internal immutable SEAPORT_V1_5;

    /// @dev Seaport 1.4 address
    address internal immutable SEAPORT_V1_4;

    /// @dev The address of NFTX zap contract for interfacing with vaults
    address internal immutable NFTX_ZAP;

    /// @dev The address of X2Y2
    address internal immutable X2Y2;

    // @dev The address of Foundation
    address internal immutable FOUNDATION;

    // @dev The address of Element Market
    address internal immutable ELEMENT_MARKET;

    // @dev the address of NFT20's zap contract
    address internal immutable NFT20_ZAP;

    // @dev the address of Larva Lab's cryptopunks marketplace
    address internal immutable CRYPTOPUNKS;

    /// @dev The address of LooksRareV2
    address internal immutable LOOKS_RARE_V2;

    /// @dev The address of LooksRare token
    ERC20 internal immutable LOOKS_RARE_TOKEN;

    /// @dev The address of LooksRare rewards distributor
    address internal immutable LOOKS_RARE_REWARDS_DISTRIBUTOR;

    /// @dev The address of router rewards distributor
    address internal immutable ROUTER_REWARDS_DISTRIBUTOR;

    constructor(NFTParameters memory params) {
        SEAPORT_V1_5 = params.seaportV1_5;
        SEAPORT_V1_4 = params.seaportV1_4;
        NFTX_ZAP = params.nftxZap;
        X2Y2 = params.x2y2;
        FOUNDATION = params.foundation;
        ELEMENT_MARKET = params.elementMarket;
        NFT20_ZAP = params.nft20Zap;
        CRYPTOPUNKS = params.cryptopunks;
        LOOKS_RARE_V2 = params.looksRareV2;
        LOOKS_RARE_TOKEN = ERC20(params.looksRareToken);
        LOOKS_RARE_REWARDS_DISTRIBUTOR = params.looksRareRewardsDistributor;
        ROUTER_REWARDS_DISTRIBUTOR = params.routerRewardsDistributor;
    }
}
