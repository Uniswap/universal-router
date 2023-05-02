// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Payments} from '../../contracts/modules/Payments.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockERC1155} from './mock/MockERC1155.sol';
import {Callbacks} from '../../contracts/base/Callbacks.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';
import {RouterParameters} from '../../contracts/base/RouterImmutables.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import 'permit2/src/interfaces/IAllowanceTransfer.sol';

import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';

contract UniversalRouterTest is Test {
    address constant RECIPIENT = address(10);
    uint256 constant AMOUNT = 10 ** 18;

    UniversalRouter router;
    ExampleModule testModule;
    MockERC20 erc20;
    MockERC1155 erc1155;
    Callbacks callbacks;

    function setUp() public {
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            seaportV1_5: address(0),
            seaportV1_4: address(0),
            openseaConduit: address(0),
            nftxZap: address(0),
            x2y2: address(0),
            foundation: address(0),
            sudoswap: address(0),
            elementMarket: address(0),
            nft20Zap: address(0),
            cryptopunks: address(0),
            looksRareV2: address(0),
            routerRewardsDistributor: address(0),
            looksRareRewardsDistributor: address(0),
            looksRareToken: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0)
        });
        router = new UniversalRouter(params);
        testModule = new ExampleModule();
        erc20 = new MockERC20();
        erc1155 = new MockERC1155();
        callbacks = new Callbacks();
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

    function testSweepToken() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(erc20), RECIPIENT, AMOUNT);

        erc20.mint(address(router), AMOUNT);
        assertEq(erc20.balanceOf(RECIPIENT), 0);

        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), AMOUNT);
    }

    function testSweepTokenInsufficientOutput() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(erc20), RECIPIENT, AMOUNT + 1);

        erc20.mint(address(router), AMOUNT);
        assertEq(erc20.balanceOf(RECIPIENT), 0);

        vm.expectRevert(Payments.InsufficientToken.selector);
        router.execute(commands, inputs);
    }

    function testSweepETH() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, RECIPIENT, AMOUNT);

        assertEq(RECIPIENT.balance, 0);

        router.execute{value: AMOUNT}(commands, inputs);

        assertEq(RECIPIENT.balance, AMOUNT);
    }

    function testSweepETHInsufficientOutput() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, RECIPIENT, AMOUNT + 1);

        erc20.mint(address(router), AMOUNT);

        vm.expectRevert(Payments.InsufficientETH.selector);
        router.execute(commands, inputs);
    }

    function testSweepERC1155NotFullAmount() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP_ERC1155)));
        bytes[] memory inputs = new bytes[](1);
        uint256 id = 0;
        inputs[0] = abi.encode(address(erc1155), RECIPIENT, id, AMOUNT / 2);

        erc1155.mint(address(router), id, AMOUNT);
        assertEq(erc1155.balanceOf(RECIPIENT, id), 0);

        router.execute(commands, inputs);

        assertEq(erc1155.balanceOf(RECIPIENT, id), AMOUNT);
    }

    function testSweepERC1155() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP_ERC1155)));
        bytes[] memory inputs = new bytes[](1);
        uint256 id = 0;
        inputs[0] = abi.encode(address(erc1155), RECIPIENT, id, AMOUNT);

        erc1155.mint(address(router), id, AMOUNT);
        assertEq(erc1155.balanceOf(RECIPIENT, id), 0);

        router.execute(commands, inputs);

        assertEq(erc1155.balanceOf(RECIPIENT, id), AMOUNT);
    }

    function testSweepERC1155InsufficientOutput() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP_ERC1155)));
        bytes[] memory inputs = new bytes[](1);
        uint256 id = 0;
        inputs[0] = abi.encode(address(erc1155), RECIPIENT, id, AMOUNT + 1);

        erc1155.mint(address(router), id, AMOUNT);

        vm.expectRevert(Payments.InsufficientToken.selector);
        router.execute(commands, inputs);
    }

    function testSupportsInterface() public {
        bool supportsERC1155 = callbacks.supportsInterface(type(IERC1155Receiver).interfaceId);
        bool supportsERC721 = callbacks.supportsInterface(type(IERC721Receiver).interfaceId);
        bool supportsERC165 = callbacks.supportsInterface(type(IERC165).interfaceId);

        assertEq(supportsERC1155, true);
        assertEq(supportsERC721, true);
        assertEq(supportsERC165, true);
    }
}
