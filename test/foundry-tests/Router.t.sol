// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {Router} from '../../contracts/Router.sol';
import {RouterCallbacks} from '../../contracts/base/RouterCallbacks.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';
import {RouterParameters} from '../../contracts/deploy/RouterParameters.sol';

import 'openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol';
import 'openzeppelin-contracts/contracts/token/ERC1155/IERC1155Receiver.sol';

contract RouterTest is Test {
    Router router;
    ExampleModule testModule;
    RouterCallbacks routerCallbacks;

    function setUp() public {
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            seaport: address(0),
            nftxZap: address(0),
            x2y2: address(0),
            foundation: address(0),
            sudoswap: address(0),
            nft20Zap: address(0),
            cryptopunks: address(0),
            looksRare: address(0),
            routerRewardsDistributor: address(0),
            looksRareRewardsDistributor: address(0),
            looksRareToken: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0)
        });
        router = new Router(params);
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
