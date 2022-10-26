pragma solidity ^0.8.17;

import 'permit2/src/interfaces/IAllowanceTransfer.sol';

contract Permit2Payments {
    address immutable PERMIT2;

    constructor(address permit2) {
        PERMIT2 = permit2;
    }

    function permit2TransferFrom(address token, address from, address to, uint160 amount) internal {
        IAllowanceTransfer(PERMIT2).transferFrom(token, from, to, amount);
    }
}
