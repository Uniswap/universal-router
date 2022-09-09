// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

library TransferHelper {
    /// @notice Thrown when safeTransferFrom fails
    error SafeTransferFromFailed();

    /// @notice Thrown when safeTransfer fails
    error SafeTransferFailed();

    /// @notice Thrown when safeApprove fails
    error SafeApproveFailed();

    /// @notice Thrown when safeTransferETH fails
    error SafeTransferETHFailed();

    /// @notice Transfers tokens from the targeted address to the given destination
    /// @param token The contract address of the token to be transferred
    /// @param from The originating address from which the tokens will be transferred
    /// @param to The destination address of the transfer
    /// @param value The amount to be transferred
    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        if (!transactionSuccessful(success, data)) {
            revert SafeTransferFromFailed();
        }
    }

    /// @notice Transfers tokens from msg.sender to a recipient
    /// @param token The contract address of the token which will be transferred
    /// @param to The recipient of the transfer
    /// @param value The value of the transfer
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        if (!transactionSuccessful(success, data)) {
            revert SafeTransferFailed();
        }
    }

    /// @notice Approves the stipulated contract to spend the given allowance in the given token
    /// @param token The contract address of the token to be approved
    /// @param to The target of the approval
    /// @param value The amount of the given token the target will be allowed to spend
    function safeApprove(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.approve.selector, to, value));
        if (!transactionSuccessful(success, data)) {
            revert SafeApproveFailed();
        }
    }

    /// @notice Transfers ETH to the recipient address
    /// @param to The destination of the transfer
    /// @param value The value to be transferred
    function safeTransferETH(address to, uint256 value) internal {
        (bool success,) = to.call{value: value}(new bytes(0));
        if (!success) {
            revert SafeTransferETHFailed();
        }
    }

    function transactionSuccessful(bool success, bytes memory data) private pure returns (bool) {
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }
}
