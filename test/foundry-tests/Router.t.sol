// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {WeirollRouter} from '../../contracts/Router.sol';
import {ExampleModule} from '../../contracts/modules/ExampleModule.sol';

contract RouterTest is Test {
    WeirollRouter router;
    ExampleModule testModule;

    function setUp() public {
        router = new WeirollRouter(address(0));
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
