// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '../interfaces/external/IWETH9.sol';
import '../libraries/Constants.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

library Payments {
    using SafeTransferLib for ERC20;
    using SafeTransferLib for address;

    error InsufficientToken();
    error InsufficientETH();
    error InvalidFeeBips();

    uint256 internal constant FEE_BIPS_BASE = 10_000;

    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token == Constants.ETH) {
            recipient.safeTransferETH(value);
        } else {
            // pay with tokens already in the contract (for the exact input multihop case)
            ERC20(token).safeTransfer(recipient, value);
        }
    }

    function sweep(address token, address recipient, uint256 amountMinimum) internal {
        uint256 balance;
        if (token == Constants.ETH) {
            balance = address(this).balance;
            if (balance < amountMinimum) revert InsufficientETH();
            if (balance > 0) recipient.safeTransferETH(balance);
        } else {
            balance = ERC20(token).balanceOf(address(this));
            if (balance < amountMinimum) revert InsufficientToken();
            if (balance > 0) ERC20(token).safeTransfer(recipient, balance);
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

    function unwrapWETH9(address recipient, uint256 amountMinimum) internal {
        uint256 value = ERC20(Constants.WETH9).balanceOf(address(this));
        if (value < amountMinimum) {
            revert InsufficientETH();
        }
        if (value > 0) {
            IWETH9(Constants.WETH9).withdraw(value);
            recipient.safeTransferETH(value);
        }
    }

    function unwrapWETH9WithFee(address recipient, uint256 amountMinimum, uint256 feeBips, address feeRecipient)
        internal
    {
        if (feeBips == 0 || feeBips > 100) revert InvalidFeeBips();

        uint256 balance = ERC20(Constants.WETH9).balanceOf(address(this));
        if (balance < amountMinimum) revert InsufficientToken();

        if (balance > 0) {
            IWETH9(Constants.WETH9).withdraw(balance);
            transferETHWithFee(recipient, balance, feeBips, feeRecipient);
        }
    }

    function sweepWithFee(
        address token,
        address recipient,
        uint256 amountMinimum,
        uint256 feeBips,
        address feeRecipient
    ) internal {
        if (feeBips == 0 || feeBips > 100) revert InvalidFeeBips();

        uint256 balance;
        if (token == Constants.ETH) {
            balance = address(this).balance;
            if (balance < amountMinimum) revert InsufficientETH();
            if (balance > 0) transferETHWithFee(recipient, balance, feeBips, feeRecipient);
        } else {
            balance = ERC20(token).balanceOf(address(this));
            if (balance < amountMinimum) revert InsufficientToken();
            if (balance > 0) {
                uint256 feeAmount = (balance * feeBips) / FEE_BIPS_BASE;
                if (feeAmount > 0) ERC20(token).safeTransfer(feeRecipient, feeAmount);
                ERC20(token).safeTransfer(recipient, balance - feeAmount);
            }
        }
    }

    // Calling function must verify that balance>0
    function transferETHWithFee(address recipient, uint256 balance, uint256 feeBips, address feeRecipient) internal {
        uint256 feeAmount = (balance * feeBips) / FEE_BIPS_BASE;
        if (feeAmount > 0) feeRecipient.safeTransferETH(feeAmount);
        recipient.safeTransferETH(balance - feeAmount);
    }
}
