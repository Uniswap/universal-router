// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract PullTokens {
    function pull(ERC20 token, address from, uint256 amount) public {
        token.transferFrom(from, address(this), amount);
    }
}
