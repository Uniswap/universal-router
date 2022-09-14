// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

import '../interfaces/external/IWETH9.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

library Payments {
    address constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @param token The token to pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address recipient, uint256 value) internal {
        if (token == WETH9 && address(this).balance >= value) {
            // pay with WETH9
            IWETH9(WETH9).deposit{value: value}(); // wrap only what is needed to pay
            IWETH9(WETH9).transfer(recipient, value);
        } else {
            // pay with tokens already in the contract (for the exact input multihop case)
            SafeTransferLib.safeTransfer(ERC20(token), recipient, value);
        }
    }
}
