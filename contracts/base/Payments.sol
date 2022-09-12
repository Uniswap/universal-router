// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../interfaces/external/IWETH9.sol';
import '../libraries/TransferHelper.sol';

library Payments {
    address constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint256 internal constant CONTRACT_BALANCE = 0;
    address internal constant ETH = address(0);

    error InsufficientToken(address token);
    error InsufficientETH();

    /// @param token The token to pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token == ETH) {
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

    function wrapETH(address recipient, uint256 value, uint256 amountMin) internal {
        if (value == CONTRACT_BALANCE) {
            value = address(this).balance;
            if (value < amountMin) {
                revert InsufficientETH();
            }
        }
        IWETH9(WETH9).deposit{value: value}();
        IWETH9(WETH9).transfer(recipient, value);
    }

    function unwrapWETH9(address recipient, uint256 value, uint256 amountMin) internal {
        if (value == CONTRACT_BALANCE) {
            value = IERC20(WETH9).balanceOf(address(this));
            if (value < amountMin) {
                revert InsufficientToken(WETH9);
            }
        }
        if (value > 0) {
            IWETH9(WETH9).withdraw(value);
            TransferHelper.safeTransferETH(recipient, value);
        }
    }
}
