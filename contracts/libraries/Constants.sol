// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @title Constant state
/// @notice Constant state used by the Universal Router
library Constants {
    /// @dev Used for identifying cases when a v2 pair has already received input tokens
    uint256 internal constant ALREADY_PAID = 0;

    /// @dev Used as a flag for identifying the transfer of ETH instead of a token
    address internal constant ETH = address(0);

    /// @dev The length of the bytes encoded address
    uint256 internal constant ADDR_SIZE = 20;

    /// @dev The length of the bytes encoded fee
    uint256 internal constant V3_FEE_SIZE = 3;

    /// @dev The offset of a single token address (20) and pool fee (3)
    uint256 internal constant NEXT_V3_POOL_OFFSET = ADDR_SIZE + V3_FEE_SIZE;

    /// @dev The offset of an encoded pool key
    /// Token (20) + Fee (3) + Token (20) = 43
    uint256 internal constant V3_POP_OFFSET = NEXT_V3_POOL_OFFSET + ADDR_SIZE;

    /// @dev The minimum length of an encoding that contains 2 or more pools
    uint256 internal constant MULTIPLE_V3_POOLS_MIN_LENGTH = V3_POP_OFFSET + NEXT_V3_POOL_OFFSET;

    /// @dev Precision multiplier for per-hop price calculations
    uint256 internal constant PRICE_PRECISION = 1e36;

    /// @dev Sentinel placed in a command's amount field to consume the ResolvedAmount register written
    /// by a prior RESOLVE command. Distinct from ActionConstants.CONTRACT_BALANCE (1 << 255) and
    /// OPEN_DELTA (0), and fits in uint128 so it is representable in v4 swap amount fields.
    uint256 internal constant USE_RESOLVED_AMOUNT = 1 << 127;
}
