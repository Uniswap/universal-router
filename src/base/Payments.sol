// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../interfaces/IPayments.sol';
import '../interfaces/external/IWETH9.sol';
import '../libraries/TransferHelper.sol';

abstract contract Payments is IPayments {
    /// @inheritdoc IPayments
    address public immutable override WETH9;

    constructor(address _WETH9) {
        WETH9 = _WETH9;
    }

    /// @inheritdoc IPayments
    function unwrapWETH9(uint256 amountMinimum, address recipient) public payable override {
        uint256 balanceWETH9 = IWETH9(WETH9).balanceOf(address(this));
        if (balanceWETH9 < amountMinimum) revert InsufficientWETH9();

        if (balanceWETH9 > 0) {
            IWETH9(WETH9).withdraw(balanceWETH9);
            TransferHelper.safeTransferETH(recipient, balanceWETH9);
        }
    }

    /// @inheritdoc IPayments
    function sweepToken(address token, uint256 amountMinimum, address recipient) public payable override {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        if (balanceToken < amountMinimum) revert InsufficientToken(token);

        if (balanceToken > 0) {
            TransferHelper.safeTransfer(token, recipient, balanceToken);
        }
    }

    /// @inheritdoc IPayments
    function refundETH() external payable override {
        if (address(this).balance > 0) TransferHelper.safeTransferETH(msg.sender, address(this).balance);
    }

    struct Payment {
      address token;
      address payer;
      address recipient;
      uint256 value;
    }

    /// @param payment The payment
    function pay(Payment memory payment) internal {
        if (payment.token == WETH9 && address(this).balance >= payment.value) {
            // pay with WETH9
            IWETH9(WETH9).deposit{value: payment.value}(); // wrap only what is needed to pay
            IWETH9(WETH9).transfer(payment.recipient, payment.value);
        } else if (payment.payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            TransferHelper.safeTransfer(payment.token, payment.recipient, payment.value);
        } else {
            // pull payment
            TransferHelper.safeTransferFrom(payment.token, payment.payer, payment.recipient, payment.value);
        }
    }
}
