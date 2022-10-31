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
    error InvalidBips();

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

    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The entity that will receive payment
    /// @param bips Portion in bips of whole balance of the contract
    function payPortion(address token, address recipient, uint256 bips) internal {
        if (bips == 0 || bips > 10_000) revert InvalidBips();
        if (token == Constants.ETH) {
            uint256 balance = address(this).balance;
            uint256 amount = (balance * bips) / FEE_BIPS_BASE;
            recipient.safeTransferETH(amount);
        } else {
            uint256 balance = ERC20(token).balanceOf(address(this));
            uint256 amount = (balance * bips) / FEE_BIPS_BASE;
            // pay with tokens already in the contract (for the exact input multihop case)
            ERC20(token).safeTransfer(recipient, amount);
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
}
