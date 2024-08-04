// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Locker} from '../libraries/Locker.sol';

contract Lock {
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

    /// @notice return the current locker of the contract
    function _getLocker() internal view returns (address) {
        return Locker.get();
    }
}
