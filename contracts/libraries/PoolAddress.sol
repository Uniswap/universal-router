// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Provides functions for deriving a pool address from the factory, tokens, and the fee
library PoolAddress {
    function computeAddress(address factory, bytes memory identifier, bytes32 initCodeHash)
        internal
        pure
        returns (address pool)
    {
        pool =
            address(uint160(uint256(keccak256(abi.encodePacked(hex'ff', factory, keccak256(identifier), initCodeHash)))));
    }
}
