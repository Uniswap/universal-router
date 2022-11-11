// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import '../libraries/Constants.sol';

library Recipient {
    function map(address recipient) internal view returns (address) {
        if (recipient == Constants.MSG_SENDER) {
            return msg.sender;
        } else if (recipient == Constants.ADDRESS_THIS) {
            return address(this);
        } else {
            return recipient;
        }
    }
}
