pragma solidity ^0.8.17;

import 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {SafeCast160} from 'permit2/src/libraries/SafeCast160.sol';
import './Payments.sol';
import '../libraries/Constants.sol';

contract Permit2Payments {
    using SafeCast160 for uint256;

    error FromAddressIsNotOwner();

    IAllowanceTransfer immutable permit2;

    constructor(IAllowanceTransfer _permit2) {
        permit2 = _permit2;
    }

    function permit2TransferFrom(address token, address from, address to, uint160 amount) internal {
        permit2.transferFrom(from, to, amount, token);
    }

    function permit2TransferFrom(IAllowanceTransfer.AllowanceTransferDetails[] memory batchDetails) internal {
        address owner = msg.sender;
        uint256 batchLength = batchDetails.length;
        for (uint256 i = 0; i < batchLength; ++i) {
            if (batchDetails[i].from != owner) revert FromAddressIsNotOwner();
        }
        IAllowanceTransfer(permit2).transferFrom(batchDetails);
    }

    function payOrPermit2Transfer(address token, address payer, address recipient, uint256 amount) internal {
        if (payer == address(this)) Payments.pay(token, recipient, amount);
        else permit2TransferFrom(token, payer, recipient, amount.toUint160());
    }
}
