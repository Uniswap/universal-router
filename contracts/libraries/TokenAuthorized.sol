// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

library TokenAuthorized {
    function _computeSlot(address spender, uint256 tokenId) internal pure returns (bytes32 hashSlot) {
        assembly ("memory-safe") {
            mstore(0, spender)
            mstore(32, tokenId)
            hashSlot := keccak256(0, 64)
        }
    }

    function setAuthorized(address spender, uint256 tokenId) internal {
        bytes32 hashSlot = _computeSlot(spender, tokenId);

        assembly {
            tstore(hashSlot, true)
        }
    }

    function getAuthorized(address spender, uint256 tokenId) internal view returns (bool authorized) {
        bytes32 hashSlot = _computeSlot(spender, tokenId);

        assembly {
            authorized := tload(hashSlot)
        }
    }
}
