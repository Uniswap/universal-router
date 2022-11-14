// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {BaseDeployBootstrap} from './BaseDeployBootstrap.sol';

/// @notice deployment bootstrap for mainnet
contract MainnetDeployBootstrap is BaseDeployBootstrap {
    /// @dev WETH9 address on mainnet
    address public constant override WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @dev Seaport address on mainnet
    address public constant override SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of NFTX zap contract on mainnet for interfacing with vaults
    address public constant override NFTX_ZAP = 0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d;

    /// @dev The address of X2Y2 on mainnet
    address public constant override X2Y2 = 0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;

    // @dev The address of Foundation on mainnet
    address public constant override FOUNDATION = 0xcDA72070E455bb31C7690a170224Ce43623d0B6f;

    // @dev The address of Sudoswap's router on mainnet
    address public constant override SUDOSWAP = 0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329;

    // @dev the address of NFT20's zap contract on mainnet
    address public constant override NFT20_ZAP = 0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0;

    // @dev the address of Larva Lab's cryptopunks marketplace on mainnet
    address public constant override CRYPTOPUNKS = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;

    /// @dev The address of LooksRare on mainnet
    address public constant override LOOKS_RARE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;

    /// @dev The address of LooksRare token on mainnet
    address public constant override LOOKS_RARE_TOKEN = 0xf4d2888d29D722226FafA5d9B24F9164c092421E;

    /// @dev The address of LooksRare rewards distributor on mainnet
    address public constant override LOOKS_RARE_REWARDS_DISTRIBUTOR = 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72;

    /// @dev The address of Router rewards distributor on mainnet
    address public constant override ROUTER_REWARDS_DISTRIBUTOR = 0x0000000000000000000000000000000000000000;

    /// @dev The address of the UniswapV2Factory on mainnet
    address public constant override UNISWAP_V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    /// @dev The address of the UniswapV3Factory on mainnet
    address public constant override UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    constructor(address permit2) BaseDeployBootstrap(permit2) {}
}
