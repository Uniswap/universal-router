// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

/// @title Calldata
/// @notice Calldata decoder used to extract arguments
library Calldata {
    function getAddress(bytes calldata self) internal pure returns (address output) {
        assembly {
            output := calldataload(self.offset)
        }
    }

    function getUint256(bytes calldata self) internal pure returns (uint256 output) {
        assembly {
            output := calldataload(self.offset)
        }
    }

    function getUint160(bytes calldata self) internal pure returns (uint160 output) {
        assembly {
            output := calldataload(self.offset)
        }
    }

    function getBool(bytes calldata self) internal pure returns (bool output) {
        assembly {
            output := calldataload(self.offset)
        }
    }

    // with offset
    function getAddress(bytes calldata self, uint8 offset) internal pure returns (address output) {
        assembly {
            output := calldataload(add(self.offset, offset))
        }
    }

    function getUint256(bytes calldata self, uint8 offset) internal pure returns (uint256 output) {
        assembly {
            output := calldataload(add(self.offset, offset))
        }
    }

    function getUint160(bytes calldata self, uint8 offset) internal pure returns (uint160 output) {
        assembly {
            output := calldataload(add(self.offset, offset))
        }
    }

    function getUint8(bytes calldata self, uint8 offset) internal pure returns (uint8 output) {
        assembly {
            output := calldataload(add(self.offset, offset))
        }
    }

    function getBool(bytes calldata self, uint8 offset) internal pure returns (bool output) {
        assembly {
            output := calldataload(add(self.offset, offset))
        }
    }
}
