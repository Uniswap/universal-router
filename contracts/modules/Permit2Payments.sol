pragma solidity ^0.8.17;

import 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {SafeCast160} from 'permit2/src/libraries/SafeCast160.sol';
import './Payments.sol';
import '../libraries/Constants.sol';
import '../base/RouterImmutables.sol';

abstract contract Permit2Payments is RouterImmutables, Payments {
    using SafeCast160 for uint256;

    function permit2TransferFrom(address token, address from, address to, uint160 amount) internal {
        IAllowanceTransfer(PERMIT2).transferFrom(from, to, amount, token);
    }

    function payOrPermit2Transfer(address token, address payer, address recipient, uint256 amount) internal {
        if (payer == address(this)) pay(token, recipient, amount);
        else permit2TransferFrom(token, payer, recipient, amount.toUint160());
    }
}
