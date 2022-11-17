// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

contract ExampleModule {
    event ExampleModuleEvent(string message);

    error CauseRevert();

    function logEvent() public {
        emit ExampleModuleEvent('testEvent');
    }

    function causeRevert() public pure {
        revert CauseRevert();
    }
}
