// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @title TransientSlots
/// @notice The single allocation table for every transient storage slot the router uses
/// @dev Slots are small literals rather than keccak-derived hashes. Each reference to a 32-byte constant costs a
/// PUSH32 in the runtime bytecode, and the router sits within a few hundred bytes of the EIP-170 limit, so the
/// hashed form spent roughly 750 bytes on nothing: transient storage is private to this contract, so the only
/// requirement is that the slots below are distinct from one another. No inherited dependency (v4-periphery,
/// permit2, solmate, OpenZeppelin 5.0) touches transient storage in the router's context. Append new slots at the
/// end and never reuse a number.
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
