// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IDeployBootstrap} from '../interfaces/IDeployBootstrap.sol';
import {UnsupportedProtocol} from './UnsupportedProtocol.sol';

/// @notice base deployment bootstrap
abstract contract BaseDeployBootstrap is IDeployBootstrap {
    /// @dev The initcodehash of the UniswapV2Pair
    bytes32 public constant override UNISWAP_V2_PAIR_INIT_CODE_HASH =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    /// @dev The initcodehash of the UniswapV3Pool
    bytes32 public constant override UNISWAP_V3_POOL_INIT_CODE_HASH =
        0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev The address of Permit2
    address public immutable override PERMIT2;

    address internal immutable UNSUPPORTED_PROTOCOL;

    constructor(address permit2) {
        UNSUPPORTED_PROTOCOL = address(new UnsupportedProtocol());
        PERMIT2 = permit2;
    }

    function WETH9() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function SEAPORT() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function NFTX_ZAP() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function X2Y2() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function FOUNDATION() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function SUDOSWAP() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function NFT20_ZAP() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function CRYPTOPUNKS() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE_TOKEN() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function LOOKS_RARE_REWARDS_DISTRIBUTOR() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function ROUTER_REWARDS_DISTRIBUTOR() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function UNISWAP_V2_FACTORY() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }

    function UNISWAP_V3_FACTORY() external view virtual override returns (address) {
        return UNSUPPORTED_PROTOCOL;
    }
}
