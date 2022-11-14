// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {Router} from '../../contracts/Router.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';
import {MainnetDeployBootstrap} from '../../contracts/deploy/MainnetDeployBootstrap.sol';

contract RouterTest is Test {
    Router router;
    ExampleModule testModule;

    function setUp() public {
        MainnetDeployBootstrap bootstrap = new MainnetDeployBootstrap(address(0));
        router = new Router(address(bootstrap));
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
