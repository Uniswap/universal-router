// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

/// @notice dummy contract that reverts on call
/// @dev used as a placeholder to ensure reverts
/// on attempted calls to protocols unsupported on this chain
contract UnsupportedProtocol {
    error UnsupportedProtocolError();

    fallback() external {
        revert UnsupportedProtocolError();
    }
}
