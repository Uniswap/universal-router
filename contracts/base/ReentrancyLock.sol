// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

contract ReentrancyLock {
    uint256 private isLocked = 1;

    modifier isNotLocked() {
        require(isLocked == 1);
        isLocked = 2;
        _;
        isLocked = 1;
    }
}
