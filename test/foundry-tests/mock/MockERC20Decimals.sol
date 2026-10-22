// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract MockERC20Decimals is ERC20 {
    constructor(uint8 _decimals) ERC20('MockD', 'MOCKD', _decimals) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
