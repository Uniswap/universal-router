// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @title IAmountResolver
/// @notice Onchain amount resolution for the RESOLVE command. A Universal Router route is static
///         calldata, so every amount is fixed offchain when the route is built; RESOLVE lets a route
///         obtain a value at execution time via a bounded staticcall to a resolver implementing this
///         interface, and reference the result from a later command's amount field using the
///         Constants.USE_RESOLVED_AMOUNT sentinel.
/// @dev Resolvers are invoked via STATICCALL and MUST be pure reads. The router copies at most one
///      word of returndata. A resolver controls only WHEN an amount is fixed, never who can move
///      funds; the returned value stays bounded by the consuming command's own caps (Permit2
///      allowances, amountInMaximum, amountOutMinimum, and any downstream balance assertions).
interface IAmountResolver {
    /// @notice Resolves an amount at execution time.
    /// @param context Resolver-defined bytes baked into the route at build time. Each implementer
    ///        documents its own context ABI; malformed context reverts.
    /// @return amount The resolved amount, in the relevant token's native decimals.
    function resolveAmount(bytes calldata context) external view returns (uint256 amount);
}
