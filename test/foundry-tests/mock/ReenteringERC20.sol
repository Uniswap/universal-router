// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @dev ERC20 that makes one arbitrary call on its next transfer — simulates a token with
///      hooks reentering mid-execution.
contract ReenteringERC20 is ERC20('Evil', 'EVIL', 18) {
    address public target;
    bytes public payload;
    bool internal armed;

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address _target, bytes calldata _payload) external {
        target = _target;
        payload = _payload;
        armed = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (armed) {
            armed = false;
            (bool s,) = target.call(payload);
            require(s, 'reenter call failed');
        }
        return ok;
    }
}
