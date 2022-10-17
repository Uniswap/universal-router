// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

/// @title Interface for NFT20Factory
interface INFT20Factory {
    function nftToToken(address nft) external view returns (address token);
}
