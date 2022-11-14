// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {UnsupportedProtocol} from './UnsupportedProtocol.sol';

/// @notice deployment bootstrap for Celo
contract CeloDeployBootstrap is IDeployBootstrap {
    /// @dev WETH9 address on Celo
    /// @dev note celo does not have WETH as their native token supports the ERC20 interface
    address public constant override WETH9 = 0x0000000000000000000000000000000000000000;

    /// @dev The initcodehash of the UniswapV2Pair
    bytes32 public constant override UNISWAP_V2_PAIR_INIT_CODE_HASH =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    /// @dev The address of the UniswapV3Factory on Celo
    address public constant override UNISWAP_V3_FACTORY = 0xAfE208a311B21f13EF87E33A90049fC17A7acDEc;

    /// @dev The initcodehash of the UniswapV3Pool
    bytes32 public constant override UNISWAP_V3_POOL_INIT_CODE_HASH =
        0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev The address of Permit2 on Celo
    address public immutable override PERMIT2;

    address internal immutable UNSUPPORTED_PROTOCOL;

    constructor(address permit2) {
        UNSUPPORTED_PROTOCOL = address(new UnsupportedProtocol());
        PERMIT2 = permit2;
    }

    function SEAPORT() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function NFTX_ZAP() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function X2Y2() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function FOUNDATION() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function SUDOSWAP() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function NFT20_ZAP() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function CRYPTOPUNKS() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE_TOKEN() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE_REWARDS_DISTRIBUTOR() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function ROUTER_REWARDS_DISTRIBUTOR() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function UNISWAP_V2_FACTORY() external view override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }
}
