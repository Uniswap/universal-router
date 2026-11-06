// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Constants} from '../libraries/Constants.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {BipsLibrary} from '@uniswap/v4-periphery/src/libraries/BipsLibrary.sol';
import {PaymentsImmutables} from '../modules/PaymentsImmutables.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @title Payments contract
/// @notice Performs various operations around the payment of ETH and tokens
abstract contract Payments is PaymentsImmutables {
    using SafeTransferLib for ERC20;
    using SafeTransferLib for address;
    using BipsLibrary for uint256;

    error InsufficientToken();
    error InsufficientETH();
    error InvalidPortion();

    /// @notice Pays an amount of ETH or ERC20 to a recipient
    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive the payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token != Constants.ETH && value == ActionConstants.CONTRACT_BALANCE) {
            value = ERC20(token).balanceOf(address(this));
        }
        _transfer(token, recipient, value);
    }

    /// @notice Pays a proportion of the contract's ETH or ERC20 to a recipient
    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive payment
    /// @param bips Portion in bips of whole balance of the contract
    function payPortion(address token, address recipient, uint256 bips) internal {
        _transfer(token, recipient, _balanceOf(token).calculatePortion(bips));
    }

    /// @notice Pays a proportion of the contract's ETH or ERC20 to a recipient with 1e18 precision
    /// @param token The token to pay (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive payment
    /// @param portion Portion of whole balance of the contract, where 1e18 represents 100%
    function payPortionFullPrecision(address token, address recipient, uint256 portion) internal {
        if (portion > 1e18) revert InvalidPortion();
        _transfer(token, recipient, _balanceOf(token) * portion / 1e18);
    }

    /// @notice Sweeps all of the contract's ERC20 or ETH to an address
    /// @param token The token to sweep (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive payment
    /// @param amountMinimum The minimum desired amount
    function sweep(address token, address recipient, uint256 amountMinimum) internal {
        uint256 balance = _balanceOf(token);
        if (balance < amountMinimum) {
            if (token == Constants.ETH) revert InsufficientETH();
            revert InsufficientToken();
        }
        if (balance > 0) _transfer(token, recipient, balance);
    }

    /// @notice Wraps an amount of ETH into WETH
    /// @param recipient The recipient of the WETH
    /// @param amount The amount to wrap (can be CONTRACT_BALANCE)
    function wrapETH(address recipient, uint256 amount) internal {
        if (amount == ActionConstants.CONTRACT_BALANCE) {
            amount = address(this).balance;
        } else if (amount > address(this).balance) {
            revert InsufficientETH();
        }
        if (amount > 0) {
            WETH9.deposit{value: amount}();
            if (recipient != address(this)) {
                WETH9.transfer(recipient, amount);
            }
        }
    }

    /// @notice Unwraps all of the contract's WETH into ETH
    /// @param recipient The recipient of the ETH
    /// @param amountMinimum The minimum amount of ETH desired
    function unwrapWETH9(address recipient, uint256 amountMinimum) internal {
        uint256 value = WETH9.balanceOf(address(this));
        if (value < amountMinimum) revert InsufficientETH();
        _unwrap(recipient, value);
    }

    /// @notice Unwraps an exact amount of the contract's WETH into ETH
    /// @param recipient The recipient of the ETH
    /// @param amount The exact amount of WETH to unwrap
    function unwrapWETH9Exact(address recipient, uint256 amount) internal {
        if (WETH9.balanceOf(address(this)) < amount) revert InsufficientETH();
        _unwrap(recipient, amount);
    }

    /// @notice Unwraps an amount of WETH and forwards the ETH to a recipient
    /// @param recipient The recipient of the ETH; if this contract, the ETH is kept here
    /// @param amount The amount of WETH to unwrap
    function _unwrap(address recipient, uint256 amount) private {
        if (amount > 0) {
            WETH9.withdraw(amount);
            if (recipient != address(this)) {
                recipient.safeTransferETH(amount);
            }
        }
    }

    /// @notice Returns the contract's balance of a token
    /// @param token The token to query (can be ETH using Constants.ETH)
    /// @return The contract's balance of the token, or its ETH balance if token is Constants.ETH
    function _balanceOf(address token) private view returns (uint256) {
        return token == Constants.ETH ? address(this).balance : ERC20(token).balanceOf(address(this));
    }

    /// @notice Transfers an amount of ETH or ERC20 to a recipient
    /// @param token The token to transfer (can be ETH using Constants.ETH)
    /// @param recipient The address that will receive the transfer
    /// @param amount The amount to transfer
    function _transfer(address token, address recipient, uint256 amount) private {
        if (token == Constants.ETH) {
            recipient.safeTransferETH(amount);
        } else {
            ERC20(token).safeTransfer(recipient, amount);
        }
    }
}
