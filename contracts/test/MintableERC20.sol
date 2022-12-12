// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract MintableERC20 is ERC20 {
    constructor(uint256 amountToMint) ERC20('test', 'TEST', 18) {
        mint(msg.sender, amountToMint);
    }

    function mint(address to, uint256 amount) public {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}
