// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract MockERC20 is ERC20 {
    constructor() ERC20('TEST', 'test', 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
