// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title a library to store spenders' authorization over v3 position token ids in transient storage
/// @dev this library implements the equivalent of a mapping, as transient storage can only be accessed in assembly
library TokenAuthorizationCache {
    /// @notice calculates which storage slot a boolean should be stored in for a given spender and tokenId
    function _computeSlot(address spender, uint256 tokenId) internal pure returns (bytes32 hashSlot) {
        assembly ("memory-safe") {
            mstore(0, and(spender, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(32, tokenId)
            hashSlot := keccak256(0, 64)
        }
    }

    /// @notice sets the authorization to true for a given spender over a given tokenId
    function cacheAuthorization(address spender, uint256 tokenId) internal {
        bytes32 hashSlot = _computeSlot(spender, tokenId);

        assembly {
            tstore(hashSlot, true)
        }
    }

    /// @notice returns whether the given spender is authorized or not over the given tokenId
    function isAuthorizationCached(address spender, uint256 tokenId) internal view returns (bool authorized) {
        bytes32 hashSlot = _computeSlot(spender, tokenId);

        assembly {
            authorized := tload(hashSlot)
        }
    }
}
