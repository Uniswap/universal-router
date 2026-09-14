// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @notice A transient register holding an amount resolved onchain by a RESOLVE command, for a later
/// command to consume via the Constants.USE_RESOLVED_AMOUNT sentinel in one of its amount fields.
/// @dev The register is transaction-scoped: RESOLVE writes it, subsequent commands (including those in
/// an EXECUTE_SUB_PLAN) read it, and the top-level execute clears it on exit so it never leaks into a
/// later execute in the same transaction.
library ResolvedAmount {
    // The slot holding the resolved amount, transiently. Must equal TransientSlots.RESOLVED_AMOUNT; inline assembly
    // only accepts a literal here.
    bytes32 constant RESOLVED_AMOUNT_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000007;

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
}
