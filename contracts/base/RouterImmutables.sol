// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {ERC20} from 'solmate/tokens/ERC20.sol';
import {IWETH9} from '../interfaces/external/IWETH9.sol';
import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';

contract RouterImmutables {
    /// @dev WETH9 address
    IWETH9 internal immutable WETH9;

    /// @dev Permit2 address
    IAllowanceTransfer internal immutable PERMIT2;

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

    constructor(IDeployBootstrap deployBootstrap) {
        PERMIT2 = IAllowanceTransfer(deployBootstrap.PERMIT2());
        WETH9 = IWETH9(deployBootstrap.WETH9());
        SEAPORT = deployBootstrap.SEAPORT();
        NFTX_ZAP = deployBootstrap.NFTX_ZAP();
        X2Y2 = deployBootstrap.X2Y2();
        FOUNDATION = deployBootstrap.FOUNDATION();
        SUDOSWAP = deployBootstrap.SUDOSWAP();
        NFT20_ZAP = deployBootstrap.NFT20_ZAP();
        CRYPTOPUNKS = deployBootstrap.CRYPTOPUNKS();
        LOOKS_RARE = deployBootstrap.LOOKS_RARE();
        LOOKS_RARE_TOKEN = ERC20(deployBootstrap.LOOKS_RARE_TOKEN());
        LOOKS_RARE_REWARDS_DISTRIBUTOR = deployBootstrap.LOOKS_RARE_REWARDS_DISTRIBUTOR();
        ROUTER_REWARDS_DISTRIBUTOR = deployBootstrap.ROUTER_REWARDS_DISTRIBUTOR();
        UNISWAP_V2_FACTORY = deployBootstrap.UNISWAP_V2_FACTORY();
        UNISWAP_V2_PAIR_INIT_CODE_HASH = deployBootstrap.UNISWAP_V2_PAIR_INIT_CODE_HASH();
        UNISWAP_V3_FACTORY = deployBootstrap.UNISWAP_V3_FACTORY();
        UNISWAP_V3_POOL_INIT_CODE_HASH = deployBootstrap.UNISWAP_V3_POOL_INIT_CODE_HASH();
    }
}
