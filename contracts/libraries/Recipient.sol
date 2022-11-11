// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import '../libraries/Constants.sol';

library Recipient {
    function map(address _recipient) internal view returns (address recipient) {
        if (recipient == Constants.MSG_SENDER) {
            recipient = msg.sender;
        } else if (recipient == Constants.ADDRESS_THIS) {
            recipient = address(this);
        } else {
            recipient = _recipient;
        }
    }
}
