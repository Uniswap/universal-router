// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {RouterWeirollVM} from '../src/Router.sol';
import {ExampleModule} from '../src/modules/ExampleModule.sol';

contract RouterTest is Test {
    RouterWeirollVM router;
    ExampleModule testModule;

    function setUp() public {
        router = new RouterWeirollVM(address(0));
        testModule = new ExampleModule();
    }

    event ExampleModuleEvent(string message);

    function testCallModule() public {
        uint256 bytecodeSize;
        address theRouter = address(router);
        assembly {
            bytecodeSize := extcodesize(theRouter)
        }
        emit log_uint(bytecodeSize);
    }
}
