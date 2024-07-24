// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Constants} from '../libraries/Constants.sol';
import {Locker} from '../libraries/Locker.sol';

contract LockAndMsgSender {
    error ContractLocked();

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

    /// @notice Function to be used instead of msg.sender, as the contract performs self-reentrancy. So at
    /// times msg.sender == address(this). Instead _msgSender() returns the initiator of the command execution
    function _msgSender() internal view returns (address) {
        return Locker.get();
    }

    /// @notice Calculates the recipient address for a command
    /// @param recipient The recipient or recipient-flag for the command
    /// @return output The resultant recipient for the command
    function map(address recipient) internal view returns (address) {
        if (recipient == Constants.MSG_SENDER) {
            return _msgSender();
        } else if (recipient == Constants.ADDRESS_THIS) {
            return address(this);
        } else {
            return recipient;
        }
    }
}
