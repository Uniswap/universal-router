// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @notice A library used to store the maximum desired amount of input tokens for exact output swaps; used for checking slippage
library MaxInputAmount {
    // The slot holding the the maximum desired amount of input tokens, transiently. bytes32(uint256(keccak256("MaxAmountIn")) - 1)
    bytes32 constant MAX_AMOUNT_IN_SLOT = 0xaf28d9864a81dfdf71cab65f4e5d79a0cf9b083905fb8971425e6cb581b3f692;

    function set(uint256 maxAmountIn) internal {
        assembly ("memory-safe") {
            tstore(MAX_AMOUNT_IN_SLOT, maxAmountIn)
        }
    }

    function get() internal view returns (uint256 maxAmountIn) {
        assembly ("memory-safe") {
            maxAmountIn := tload(MAX_AMOUNT_IN_SLOT)
        }
    }
}
