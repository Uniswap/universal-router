// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Constants} from './Constants.sol';
import {RESOLVED_AMOUNT_SLOT} from './TransientSlots.sol';

/// @notice A transient register holding an amount resolved onchain by a RESOLVE command, for a later
/// command to consume via the Constants.USE_RESOLVED_AMOUNT sentinel in one of its amount fields.
/// @dev The register is transaction-scoped: RESOLVE writes it, subsequent commands (including those in
/// an EXECUTE_SUB_PLAN) read it, and the top-level execute clears it on exit so it never leaks into a
/// later execute in the same transaction. Zero means empty: RESOLVE clears the register whenever it
/// fails, and a resolver returning zero counts as a failure, so no command acts on a value no RESOLVE produced.
library ResolvedAmount {
    /// @notice Thrown when a command consumes the USE_RESOLVED_AMOUNT sentinel while the register is empty
    error ResolvedAmountUnset();

    function set(uint256 amount) internal {
        assembly ('memory-safe') {
            tstore(RESOLVED_AMOUNT_SLOT, amount)
        }
    }

    function get() internal view returns (uint256 amount) {
        assembly ('memory-safe') {
            amount := tload(RESOLVED_AMOUNT_SLOT)
        }
    }

    function reset() internal {
        assembly ('memory-safe') {
            tstore(RESOLVED_AMOUNT_SLOT, 0)
        }
    }

    /// @notice Maps a command's amount field through the register: the USE_RESOLVED_AMOUNT sentinel reads the
    /// register, any other value passes through unchanged
    /// @dev Reverts on an empty register so the sentinel can never fall through as a zero amount, which the v4
    /// swap helpers would read as OPEN_DELTA
    function map(uint256 amount) internal view returns (uint256) {
        if (amount != Constants.USE_RESOLVED_AMOUNT) return amount;
        amount = get();
        if (amount == 0) revert ResolvedAmountUnset();
        return amount;
    }
}
