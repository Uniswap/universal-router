// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @notice An ERC20 that diverts a fee out of every transfer, so the receiver gets less than the sender debited.
///         A fee of 10_000 bps diverts everything, which models a token that simply keeps what it is sent.
contract MockFeeOnTransferERC20 is ERC20 {
    address public constant FEE_SINK = address(0xFEE);

    uint256 public immutable feeBps;

    constructor(uint256 _feeBps) ERC20('FEE', 'fee', 18) {
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 fee = amount * feeBps / 10_000;
        balanceOf[from] -= amount;
        // the fee moves to a sink rather than burning, so balances seeded with deal() need no matching supply
        unchecked {
            balanceOf[to] += amount - fee;
            balanceOf[FEE_SINK] += fee;
        }
        emit Transfer(from, to, amount - fee);
    }
}
