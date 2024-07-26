// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract ReenteringWETH is ERC20 {
    error NotAllowedReenter();

    address universalRouter;
    bytes data;

    constructor() ERC20('ReenteringWETH', 'RW', 18) {}

    function setParameters(address _universalRouter, bytes memory _data) external {
        universalRouter = _universalRouter;
        data = _data;
    }

    function deposit() public payable {
        (bool success,) = universalRouter.call(data);
        if (!success) revert NotAllowedReenter();
    }
}
