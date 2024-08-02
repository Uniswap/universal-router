// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Locker} from '../libraries/Locker.sol';

contract LockAndMsgSender {
    error ContractLocked();

    /// @notice Modifier enforcing a reentrancy lock that allows self-reentrancy
    modifier isNotLocked() {
        // Apply a reentrancy lock for all external callers
        if (msg.sender != address(this)) {
            if (Locker.isLocked()) revert ContractLocked();
            Locker.set(msg.sender);
            _;
            Locker.set(address(0));
        } else {
            // The contract is allowed to reenter itself, so the lock is not checked
            _;
        }
    }

    /// @notice Function to be used instead of msg.sender, as the contract performs self-reentrancy and at
    /// times msg.sender == address(this). Instead msgSender() returns the initiator of the lock
    function msgSender() public view returns (address) {
        return Locker.get();
    }
}
