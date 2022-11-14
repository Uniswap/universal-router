// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {ERC20} from 'solmate/tokens/ERC20.sol';
import {IWETH9} from '../interfaces/external/IWETH9.sol';
import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';

contract RouterImmutables {
    /// @dev WETH9 address
    IWETH9 internal immutable WETH9;

    /// @dev Permit2 address
    address internal immutable PERMIT2;

    /// @dev Seaport address
    address internal immutable SEAPORT;

    /// @dev The address of NFTX zap contract for interfacing with vaults
    address internal immutable NFTX_ZAP;

    /// @dev The address of X2Y2
    address internal immutable X2Y2;

    // @dev The address of Foundation
    address internal immutable FOUNDATION;

    // @dev The address of Sudoswap's router
    address internal immutable SUDOSWAP;

    // @dev the address of NFT20's zap contract
    address internal immutable NFT20_ZAP;

    // @dev the address of Larva Lab's cryptopunks marketplace
    address internal immutable CRYPTOPUNKS;

    /// @dev The address of LooksRare
    address internal immutable LOOKS_RARE;

    /// @dev The address of LooksRare token
    ERC20 internal immutable LOOKS_RARE_TOKEN;

    /// @dev The address of LooksRare rewards distributor
    address internal immutable LOOKS_RARE_REWARDS_DISTRIBUTOR;

    /// @dev The address of router rewards distributor
    address internal immutable ROUTER_REWARDS_DISTRIBUTOR;

    /// @dev The address of UniswapV2Factory
    address internal immutable UNISWAP_V2_FACTORY;

    /// @dev The address of UniswapV2Pair initcodehash
    bytes32 internal immutable UNISWAP_V2_PAIR_INIT_CODE_HASH;

    /// @dev The address of UniswapV3Factory
    address internal immutable UNISWAP_V3_FACTORY;

    /// @dev The address of UniswapV3Pool initcodehash
    bytes32 internal immutable UNISWAP_V3_POOL_INIT_CODE_HASH;

    constructor(
        address permit2,
        address weth9,
        address seaport,
        address nftxZap,
        address x2y2,
        address foundation,
        address sudoswap,
        address nft20Zap,
        address cryptopunks,
        address looksRare,
        address routerRewardsDistributor,
        address looksRareRewardsDistributor,
        address looksRareToken,
        address v2Factory,
        address v3Factory,
        bytes32 pairInitCodeHash,
        bytes32 poolInitCodeHash) {
        PERMIT2 = permit2;
        WETH9 = IWETH9(weth9);
        SEAPORT = seaport;
        NFTX_ZAP = nftxZap;
        X2Y2 = x2y2;
        FOUNDATION = foundation;
        SUDOSWAP = sudoswap;
        NFT20_ZAP = nft20Zap;
        CRYPTOPUNKS = cryptopunks;
        LOOKS_RARE = looksRare;
        LOOKS_RARE_TOKEN = ERC20(looksRareToken);
        LOOKS_RARE_REWARDS_DISTRIBUTOR = looksRareRewardsDistributor;
        ROUTER_REWARDS_DISTRIBUTOR = routerRewardsDistributor;
        UNISWAP_V2_FACTORY = v2Factory;
        UNISWAP_V2_PAIR_INIT_CODE_HASH = pairInitCodeHash;
        UNISWAP_V3_FACTORY = v3Factory;
        UNISWAP_V3_POOL_INIT_CODE_HASH = poolInitCodeHash;
    }
}
