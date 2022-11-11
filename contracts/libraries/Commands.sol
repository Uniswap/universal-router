// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

/// @title Commands
/// @notice Command Flags used to decode commands
library Commands {
    bytes1 internal constant FLAG_ALLOW_REVERT = 0x80;
    bytes1 internal constant COMMAND_TYPE_MASK = 0x1f;

    // Command Types. Maximum supported command at this moment is 0x1F.
    uint256 constant PERMIT2_PERMIT = 0x00;
    uint256 constant TRANSFER = 0x01;
    uint256 constant V3_SWAP_EXACT_IN = 0x02;
    uint256 constant V3_SWAP_EXACT_OUT = 0x03;
    uint256 constant V2_SWAP_EXACT_IN = 0x04;
    uint256 constant V2_SWAP_EXACT_OUT = 0x05;
    uint256 constant SEAPORT = 0x06;
    uint256 constant WRAP_ETH = 0x07;
    uint256 constant UNWRAP_WETH = 0x08;
    uint256 constant SWEEP = 0x09;
    uint256 constant NFTX = 0x0a;
    uint256 constant LOOKS_RARE_721 = 0x0b;
    uint256 constant X2Y2_721 = 0x0c;
    uint256 constant LOOKS_RARE_1155 = 0x0d;
    uint256 constant X2Y2_1155 = 0x0e;
    uint256 constant FOUNDATION = 0x0f;
    uint256 constant PAY_PORTION = 0x10;
    uint256 constant SWEEP_ERC721 = 0x11;
    uint256 constant SUDOSWAP = 0x12;
    uint256 constant NFT20 = 0x13;
    uint256 constant OWNERSHIP_CHECK_721 = 0x14;
    uint256 constant OWNERSHIP_CHECK_1155 = 0x15;
    uint256 constant CRYPTOPUNKS = 0x16;
    uint256 constant PERMIT2_TRANSFER_FROM = 0x17;
    uint256 constant PERMIT2_PERMIT_BATCH = 0x19;
    uint256 constant SWEEP_ERC1155 = 0x1a;
}
