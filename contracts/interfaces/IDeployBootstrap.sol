// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

/// @notice interface to expose protocol addresses
/// and constants for multichain deployments
interface IDeployBootstrap {
    function PERMIT2() external view returns (address);
    function WETH9() external view returns (address);
    function SEAPORT() external view returns (address);
    function NFTX_ZAP() external view returns (address);
    function X2Y2() external view returns (address);
    function FOUNDATION() external view returns (address);
    function SUDOSWAP() external view returns (address);
    function NFT20_ZAP() external view returns (address);
    function CRYPTOPUNKS() external view returns (address);
    function LOOKS_RARE() external view returns (address);
    function LOOKS_RARE_TOKEN() external view returns (address);
    function LOOKS_RARE_REWARDS_DISTRIBUTOR() external view returns (address);
    function ROUTER_REWARDS_DISTRIBUTOR() external view returns (address);
    function UNISWAP_V2_FACTORY() external view returns (address);
    function UNISWAP_V2_PAIR_INIT_CODE_HASH() external view returns (bytes32);
    function UNISWAP_V3_FACTORY() external view returns (address);
    function UNISWAP_V3_POOL_INIT_CODE_HASH() external view returns (bytes32);
}
