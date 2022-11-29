// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

contract ReentrancyLock {
    error ContractLocked();

    uint256 private isLocked = 1;

    modifier isNotLocked() {
        if (isLocked != 1) revert ContractLocked();
        isLocked = 2;
        _;
        isLocked = 1;
    }
}
