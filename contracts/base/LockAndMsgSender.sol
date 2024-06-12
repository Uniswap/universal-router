// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Constants} from '../libraries/Constants.sol';
import {Locker} from '../libraries/Locker.sol';

contract LockAndMsgSender {
    error ContractLocked();

    modifier isNotLocked() {
        if (msg.sender != address(this)) {
            if (Locker.get() != address(0)) revert ContractLocked();
            Locker.set(msg.sender);
            _;
            Locker.set(address(0));
        } else {
            _;
        }
    }

    /// @notice Calculates the recipient address for a command
    /// @param recipient The recipient or recipient-flag for the command
    /// @return output The resultant recipient for the command
    function map(address recipient) internal view returns (address) {
        if (recipient == Constants.MSG_SENDER) {
            return Locker.get();
        } else if (recipient == Constants.ADDRESS_THIS) {
            return address(this);
        } else {
            return recipient;
        }
    }
}
