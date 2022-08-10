// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import 'openzeppelin-contracts/contracts/token/ERC20/IERC20.sol';
import '../interfaces/IPayments.sol';
import '../interfaces/external/IWETH9.sol';
import '../libraries/TransferHelper.sol';

abstract contract Payments is IPayments {
    /// @inheritdoc IPayments
    address public immutable override WETH9;

    constructor(address _WETH9) {
        WETH9 = _WETH9;
    }

    receive() external payable {
        if (msg.sender != WETH9) revert NotWETH9();
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

    /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address payer, address recipient, uint256 value) internal {
        if (token == WETH9 && address(this).balance >= value) {
            // pay with WETH9
            IWETH9(WETH9).deposit{value: value}(); // wrap only what is needed to pay
            IWETH9(WETH9).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            TransferHelper.safeTransfer(token, recipient, value);
        } else {
            // pull payment
            TransferHelper.safeTransferFrom(token, payer, recipient, value);
        }
    }
}
