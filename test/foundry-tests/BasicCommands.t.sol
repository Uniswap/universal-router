// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import './utils/MockERC20.sol';
import './Constants.sol';
import {Router} from '../../contracts/Router.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';

contract BasicCommandsTest is Test, Constants {
    Router router;
    MockERC20 token;

    function setUp() public {
        router = new Router(address(0), V2_FACTORY_MAINNET, V3_FACTORY_MAINNET, V2_INIT_CODE_HASH_MAINNET, V3_INIT_CODE_HASH_MAINNET);
        token = new MockERC20("Test", "TEST", 18);
    }

    function testTransfer() public {
        token.mint(address(router), 10**18);
        address user = vm.addr(1234);
        string[] memory ffiCommand = new string[](6);
        ffiCommand[0] = "narwhal-planner";
        ffiCommand[1] = "-p";
        ffiCommand[2] = "TransferCommand";
        ffiCommand[3] = vm.toString(address(token));
        ffiCommand[4] = vm.toString(user);
        ffiCommand[5] = vm.toString(uint256(10**18));
        bytes memory weiroll = vm.ffi(ffiCommand);
        (bytes memory commands, bytes[] memory state) = abi.decode(weiroll, (bytes, bytes[]));

        uint256 preBalance = token.balanceOf(user);
        router.execute(block.timestamp, commands, state);
        uint256 postBalance = token.balanceOf(user);
        assertEq(preBalance + 10**18, postBalance);
    }
}
