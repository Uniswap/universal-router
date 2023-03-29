// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {Constants} from '../libraries/Constants.sol';

contract LockAndMsgSender {
    error ContractLocked();
    error ContractNotLocked();

    address private constant NOT_LOCKED_FLAG = address(1);
    address private _lockedBy = NOT_LOCKED_FLAG;

    modifier isNotLocked() {
        if (msg.sender != address(this)) {
            if (_lockedBy != NOT_LOCKED_FLAG) revert ContractLocked();
            _lockedBy = msg.sender;
            _;
            _lockedBy = NOT_LOCKED_FLAG;
        } else {
            _;
        }
    }

    function lockedBy() internal view returns (address) {
        if (_lockedBy == NOT_LOCKED_FLAG) revert ContractNotLocked();
        return _lockedBy;
    }

    /// @notice Calculates the recipient address for a command
    /// @param recipient The recipient or recipient-flag for the command
    /// @return output The resultant recipient for the command
    function map(address recipient) internal view returns (address) {
        if (recipient == Constants.MSG_SENDER) {
            return _lockedBy;
        } else if (recipient == Constants.ADDRESS_THIS) {
            return address(this);
        } else {
            return recipient;
        }
    }
}
