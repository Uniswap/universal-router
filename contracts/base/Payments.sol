// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../interfaces/external/IWETH9.sol';
import '../libraries/TransferHelper.sol';
import '../libraries/Constants.sol';

library Payments {
    error InsufficientToken(address token);
    error InsufficientETH();

    /// @param token The token to pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token == Constants.ETH) {
            TransferHelper.safeTransferETH(recipient, value);
        } else {
            TransferHelper.safeTransfer(token, recipient, value);
        }
    }

    function sweepToken(address token, address recipient, uint256 amountMinimum) internal {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, 'Insufficient token');

        if (balanceToken > 0) {
            TransferHelper.safeTransfer(token, recipient, balanceToken);
        }
    }

    function wrapETH(address recipient, uint256 amount) internal {
        if (amount == Constants.CONTRACT_BALANCE) {
            amount = address(this).balance;
        } else if (amount > address(this).balance) {
            revert InsufficientETH();
        }
        if (amount > 0) {
            IWETH9(Constants.WETH9).deposit{value: amount}();
            IWETH9(Constants.WETH9).transfer(recipient, amount);
        }
    }

    function unwrapWETH9(address recipient, uint256 amountMin) internal {
        uint256 value = IERC20(Constants.WETH9).balanceOf(address(this));
        if (value < amountMin) {
            revert InsufficientETH();
        }
        if (value > 0) {
            IWETH9(Constants.WETH9).withdraw(value);
            TransferHelper.safeTransferETH(recipient, value);
        }
    }
}
