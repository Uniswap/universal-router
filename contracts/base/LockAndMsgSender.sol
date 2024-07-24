// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Locker} from '../libraries/Locker.sol';

contract LockAndMsgSender {
    error ContractLocked();

    /// @notice Modifier enforcing a reentrancy lock that allows self-reentrancy
    modifier isNotLocked() {
        // The contract is allowed to reenter itself to perform EXECUTE_SUB_PLAN commands
        if (msg.sender != address(this)) {
            if (Locker.isLocked()) revert ContractLocked();
            Locker.set(msg.sender);
            _;
            Locker.set(address(0));
        } else {
            _;
        }
    }

    /// @notice Function to be used instead of msg.sender, as the contract performs self-reentrancy and at
    /// times msg.sender == address(this). Instead _msgSender() returns the initiator of the lock
    function _msgSender() internal view returns (address) {
        return Locker.get();
    }
}
