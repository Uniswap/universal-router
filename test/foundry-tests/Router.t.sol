// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {Router} from '../../contracts/Router.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';

contract RouterTest is Test {
    Router router;
    ExampleModule testModule;

    function setUp() public {
        router = new Router(address(0), address(0), address(0), address(0), bytes32(0), bytes32(0));
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
