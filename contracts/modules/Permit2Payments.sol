pragma solidity ^0.8.17;

import 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {SafeCast160} from 'permit2/src/libraries/SafeCast160.sol';
import './Payments.sol';
import '../libraries/Constants.sol';

contract Permit2Payments {
    using SafeCast160 for uint256;

    IAllowanceTransfer immutable permit2;

    constructor(IAllowanceTransfer _permit2) {
        permit2 = _permit2;
    }

    function permit2TransferFrom(address token, address from, address to, uint160 amount) internal {
        permit2.transferFrom(from, to, amount, token);
    }

    function payOrPermit2Transfer(address token, address payer, address recipient, uint256 amount) internal {
        if (payer == address(this)) Payments.pay(token, recipient, amount);
        else permit2TransferFrom(token, payer, recipient, amount.toUint160());
    }
}
