// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

contract TestCustomErrors {
    // adding so that hardhat knows this custom signature selector for external contracts
    error InvalidSignature();
    error UnsafeCast();
}
