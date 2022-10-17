// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

/// @title Interface for NFT20
interface INFT20 {
    // withdraw nft and burn tokens
    function withdraw(uint256[] calldata _tokenIds, uint256[] calldata amounts, address recipient) external;
}
