// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {Router} from '../../contracts/Router.sol';
import {RouterCallbacks} from '../../contracts/base/RouterCallbacks.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';
import {ERC20} from 'solmate/tokens/ERC20.sol';
import 'permit2/src/interfaces/IAllowanceTransfer.sol';

import 'openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol';
import 'openzeppelin-contracts/contracts/token/ERC1155/IERC1155Receiver.sol';

contract RouterTest is Test {
    Router router;
    ExampleModule testModule;
    RouterCallbacks routerCallbacks;

    function setUp() public {
        router =
        new Router(IAllowanceTransfer(address(0)), address(0),address(0), ERC20(address(0)), address(0), address(0), bytes32(0), bytes32(0));
        testModule = new ExampleModule();
        routerCallbacks = new RouterCallbacks();
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

    function testSupportsInterface() public {
        bool supportsERC1155 = routerCallbacks.supportsInterface(type(IERC1155Receiver).interfaceId);
        bool supportsERC721 = routerCallbacks.supportsInterface(type(IERC721Receiver).interfaceId);
        bool supportsERC165 = routerCallbacks.supportsInterface(type(IERC165).interfaceId);

        assertEq(supportsERC1155, true);
        assertEq(supportsERC721, true);
        assertEq(supportsERC165, true);
    }
}
