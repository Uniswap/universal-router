// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';
import {ISwapProxy} from './interfaces/ISwapProxy.sol';

/// @title SwapProxy
/// @notice Enables 2-tx swap flow (approve + swap) without Permit2 signed messages
/// @dev Transfers tokens from the user directly into the Universal Router (UR), then
///      executes UR commands with payerIsUser=false so the router uses its own balance.
///      This contract is to help with token-inputs, ETH-input actions should be sent directly to the UR.
///      IMPORTANT: All swap commands MUST use payerIsUser=false.
///      All recipient addresses MUST be the user's explicit address, NOT MSG_SENDER,
///      because MSG_SENDER resolves to this proxy contract within the UR execution context.
contract SwapProxy is ISwapProxy {
    using SafeTransferLib for ERC20;

    /// @inheritdoc ISwapProxy
    function execute(
        IUniversalRouter router,
        address token,
        uint256 amount,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external {
        // Note: Solmate's SafeTransferLib does not check that the token address contains code.
        // Transfer calls to empty addresses silently succeed.
        ERC20(token).safeTransferFrom(msg.sender, address(router), amount);
        router.execute(commands, inputs, deadline);
    }
}
