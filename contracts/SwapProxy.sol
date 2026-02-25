// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';
import {ISwapProxy} from './interfaces/ISwapProxy.sol';

/// @title SwapProxy
/// @notice Enables 2-tx swap flow (approve + swap) without Permit2 signed messages
/// @dev Transfers tokens from the user directly into the Universal Router, then
///      executes UR commands with payerIsUser=false so the router uses its own balance.
///      IMPORTANT: All swap commands MUST use payerIsUser=false.
///      All recipient addresses MUST be the user's explicit address, NOT MSG_SENDER,
///      because MSG_SENDER resolves to this proxy contract within the UR execution context.
contract SwapProxy is ISwapProxy {
    using SafeTransferLib for ERC20;

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
    ) external payable {
        ERC20(token).safeTransferFrom(msg.sender, address(router), amount);
        router.execute{value: msg.value}(commands, inputs, deadline);
    }
}
