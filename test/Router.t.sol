// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {Router} from '../src/Router.sol';
import {ExampleModule} from '../src/modules/ExampleModule.sol';

contract RouterTest is Test {
    Router router;
    ExampleModule testModule;
    Router.ModuleCall[] calls;

    function setUp() public {
        router = new Router();
        testModule = new ExampleModule();
    }

    event ExampleModuleEvent(string message);

    function testCallModule() public {
        calls.push(Router.ModuleCall(address(testModule), abi.encode(testModule.logEvent.selector)));
        vm.expectEmit(false, false, false, true);
        emit ExampleModuleEvent('testEvent');
        router.route(calls);
    }

    function testModuleRevert() public {
        calls.push(Router.ModuleCall(address(testModule), abi.encode(testModule.causeRevert.selector)));
        vm.expectRevert(ExampleModule.CauseRevert.selector);
        router.route(calls);
    }
}
