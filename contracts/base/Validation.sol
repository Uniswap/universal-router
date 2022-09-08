// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

abstract contract Validation {
    /// @notice Thrown when a transaction is executed after its expiry
    /// @param deadline When the transaction expired
    error TransactionExpired(uint256 deadline);

    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) {
            revert TransactionExpired(deadline);
        }
        _;
    }
}
