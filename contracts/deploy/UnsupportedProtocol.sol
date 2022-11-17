// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

/// @title Dummy contract that always reverts
/// @notice Used as a placeholder to ensure reverts on attempted calls to protocols unsupported on a given chain
contract UnsupportedProtocol {
    error UnsupportedProtocolError();

    fallback() external {
        revert UnsupportedProtocolError();
    }
}
