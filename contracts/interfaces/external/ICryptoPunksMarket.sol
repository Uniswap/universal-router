// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

/// @title Interface for WETH9
interface ICryptoPunksMarket {
    function buyPunk(uint punkIndex) external payable;

    function transferPunk(address to, uint punkIndex) external;
}
