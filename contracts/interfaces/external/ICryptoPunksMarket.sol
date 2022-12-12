// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

/// @title Interface for CryptoPunksMarket
interface ICryptoPunksMarket {
    /// @notice Buy a cryptopunk
    function buyPunk(uint256 punkIndex) external payable;

    /// @notice Transfer a cryptopunk to another address
    function transferPunk(address to, uint256 punkIndex) external;
}
