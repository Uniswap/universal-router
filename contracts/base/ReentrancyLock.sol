// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

contract ReentrancyLock {
    uint256 private isLocked = 0;

    modifier isNotLocked() {
        require(isLocked == 0);
        isLocked = 1;
        _;
        isLocked = 0;
    }
}
