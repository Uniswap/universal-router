// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MAX_AMOUNT_IN_SLOT} from './TransientSlots.sol';

/// @notice A library used to store the maximum desired amount of input tokens for exact output swaps; used for checking slippage
library MaxInputAmount {
    function set(uint256 maxAmountIn) internal {
        assembly ('memory-safe') {
            tstore(MAX_AMOUNT_IN_SLOT, maxAmountIn)
        }
    }

    function get() internal view returns (uint256 maxAmountIn) {
        assembly ('memory-safe') {
            maxAmountIn := tload(MAX_AMOUNT_IN_SLOT)
        }
    }
}
