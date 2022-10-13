// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

library CommandBuilder {
    uint256 constant IDX_VARIABLE_LENGTH = 0x80;
    uint256 constant IDX_VALUE_MASK = 0x7f;
    uint256 constant IDX_END_OF_ARGS = 0xff;

    function buildInputs(bytes[] memory state, bytes32 indices) internal view returns (bytes memory ret) {
        uint256 count; // Number of bytes in whole ABI encoded message
        uint256 free; // Pointer to first free byte in tail part of message
        uint256 idx;

        // Determine the length of the encoded data
        for (uint256 i; i < 32;) {
            idx = uint8(indices[i]);
            if (idx == IDX_END_OF_ARGS) {
                break;
            }

            if (idx & IDX_VARIABLE_LENGTH != 0) {
                // Add the size of the value, rounded up to the next word boundary, plus space for pointer and length
                uint256 arglen = state[idx & IDX_VALUE_MASK].length;
                require(arglen % 32 == 0, 'Dynamic state variables must be a multiple of 32 bytes');
                count += arglen + 32;
            } else {
                require(state[idx & IDX_VALUE_MASK].length == 32, 'Static state variables must be 32 bytes');
                count += 32;
            }
            unchecked {
                free += 32;
            }
            unchecked {
                ++i;
            }
        }

        ret = new bytes(count);
        count = 0;

        for (uint256 i; i < 32;) {
            idx = uint8(indices[i]);
            if (idx == IDX_END_OF_ARGS) {
                break;
            }

            if (idx & IDX_VARIABLE_LENGTH != 0) {
                uint256 arglen = state[idx & IDX_VALUE_MASK].length;

                // Variable length data; put a pointer in the slot and write the data at the end
                assembly {
                    mstore(add(add(ret, 32), count), free)
                }
                memcpy(state[idx & IDX_VALUE_MASK], 0, ret, free, arglen);
                free += arglen;
            } else {
                // Fixed length data; write it directly
                bytes memory statevar = state[idx & IDX_VALUE_MASK];
                assembly {
                    mstore(add(add(ret, 32), count), mload(add(statevar, 32)))
                }
            }
            unchecked {
                count += 32;
            }
            unchecked {
                ++i;
            }
        }
    }

    function memcpy(bytes memory src, uint256 srcidx, bytes memory dest, uint256 destidx, uint256 len) internal view {
        assembly {
            pop(staticcall(gas(), 4, add(add(src, 32), srcidx), len, add(add(dest, 32), destidx), len))
        }
    }
}
