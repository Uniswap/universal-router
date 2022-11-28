// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.15;

contract ReenteringProtocol {
    error NotAllowedReenter();

    function callAndReenter(address universalRouter, bytes calldata data) public payable {
        (bool success,) = universalRouter.call(data);
        if (!success) revert NotAllowedReenter();
    }
}
