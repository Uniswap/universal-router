// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IWETH9} from '../interfaces/external/IWETH9.sol';

/// @title Constant state
/// @notice Constant state used by the universal router
library Constants {
    /// @dev Used for identifying cases when this contract's balance of a token is to be used
    /// This is equivalent to 1<<255, a.k.a a singular 1 in the most significant bit.
    uint256 internal constant CONTRACT_BALANCE = 0x8000000000000000000000000000000000000000000000000000000000000000;

    /// @dev Used for identifying cases when a v2 pair has already received the input money
    uint256 internal constant ALREADY_PAID = 0;

    /// @dev Used as a flag for identifying the transfer of ETH instead a token
    address internal constant ETH = address(0);

    /// @dev Used as a flag for identifying msg.sender, saves gas by sending more 0 bytes
    address internal constant MSG_SENDER = address(1);

    /// @dev Used as a flag for identifying address(this), saves gas by sending more 0 bytes
    address internal constant ADDRESS_THIS = address(2);
}
