// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {IUniversalRouter} from './IUniversalRouter.sol';

/// @title ISwapProxy
/// @notice Interface for the SwapProxy contract that enables 2-tx swap flow without Permit2
interface ISwapProxy {
    /// @notice Pull ERC20 tokens from msg.sender into the Universal Router, then execute commands
    /// @param router The Universal Router to execute commands on
    /// @param token The ERC20 token to pull from the caller
    /// @param amount The amount of tokens to transfer into the UR
    /// @param commands The encoded UR commands to execute
    /// @param inputs The encoded inputs for each command
    /// @param deadline The transaction deadline
    function execute(
        IUniversalRouter router,
        address token,
        uint256 amount,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external;
}
