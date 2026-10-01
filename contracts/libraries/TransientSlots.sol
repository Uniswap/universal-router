// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @title TransientSlots
/// @notice The single allocation table for every transient storage slot the router uses
/// @dev Slots are small literals rather than keccak hashes: each 32-byte constant costs a PUSH32, and the hashed form
/// spent roughly 700 bytes of a contract near the EIP-170 limit. Transient storage is per-contract, so the slots only
/// need to be distinct from one another, and no dependency (v4-periphery, permit2, solmate, OpenZeppelin 5.0) uses
/// transient storage in the router's context. Append new slots at the end and never reuse a number.
/// WARNING: solc >=0.8.28 allocates `transient` state variables from slot 0 upward, so they would collide with this
/// table. No contract in the router's inheritance tree, dependencies included, may declare one. To adopt `transient`,
/// migrate every slot below in one change and delete this table.
library TransientSlots {
    /// @dev The address that holds the reentrancy lock (Locker.sol)
    bytes32 internal constant LOCKER = 0x0000000000000000000000000000000000000000000000000000000000000001;

    /// @dev The maximum input amount for an in-flight v3 exact-output swap (MaxInputAmount.sol)
    bytes32 internal constant MAX_AMOUNT_IN = 0x0000000000000000000000000000000000000000000000000000000000000002;

    /// @dev The signer of the executing signed route (RouteSigner.sol)
    bytes32 internal constant ROUTE_SIGNER = 0x0000000000000000000000000000000000000000000000000000000000000003;

    /// @dev The intent of the executing signed route (RouteSigner.sol)
    bytes32 internal constant ROUTE_INTENT = 0x0000000000000000000000000000000000000000000000000000000000000004;

    /// @dev The data of the executing signed route (RouteSigner.sol)
    bytes32 internal constant ROUTE_DATA = 0x0000000000000000000000000000000000000000000000000000000000000005;

    /// @dev Whether the caller opted into running inside a foreign PoolManager unlock (NestedUnlock.sol)
    bytes32 internal constant NESTED_UNLOCK = 0x0000000000000000000000000000000000000000000000000000000000000006;

    /// @dev The amount written by a RESOLVE command for a later command to consume (ResolvedAmount.sol)
    bytes32 internal constant RESOLVED_AMOUNT = 0x0000000000000000000000000000000000000000000000000000000000000007;
}
