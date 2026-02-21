// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Payments} from '../../contracts/modules/Payments.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {ExampleModule} from '../../contracts/test/ExampleModule.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {IERC165} from '@openzeppelin/contracts/utils/introspection/IERC165.sol';

contract UniversalRouterTest is Test {
    address constant RECIPIENT = address(1234);
    uint256 constant AMOUNT = 10 ** 18;

    UniversalRouter router;
    ExampleModule testModule;
    MockERC20 erc20;

    function setUp() public {
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
        testModule = new ExampleModule();
        erc20 = new MockERC20();
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

    function testPayPortionFullPrecisionToken() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PAY_PORTION_FULL_PRECISION)));
        bytes[] memory inputs = new bytes[](1);
        // 50% = 0.5e18
        inputs[0] = abi.encode(address(erc20), RECIPIENT, 5e17);

        erc20.mint(address(router), AMOUNT);
        assertEq(erc20.balanceOf(RECIPIENT), 0);

        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), AMOUNT / 2);
    }

    function testPayPortionFullPrecisionETH() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PAY_PORTION_FULL_PRECISION)));
        bytes[] memory inputs = new bytes[](1);
        // 100% = 1e18
        inputs[0] = abi.encode(Constants.ETH, RECIPIENT, 1e18);

        assertEq(RECIPIENT.balance, 0);

        router.execute{value: AMOUNT}(commands, inputs);

        assertEq(RECIPIENT.balance, AMOUNT);
    }

    function testPayPortionFullPrecisionInvalidPortion() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PAY_PORTION_FULL_PRECISION)));
        bytes[] memory inputs = new bytes[](1);
        // portion > 1e18 should revert
        inputs[0] = abi.encode(address(erc20), RECIPIENT, 1e18 + 1);

        erc20.mint(address(router), AMOUNT);

        vm.expectRevert(Payments.InvalidPortion.selector);
        router.execute(commands, inputs);
    }

    function testPayPortionFullPrecisionSmallFraction() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PAY_PORTION_FULL_PRECISION)));
        bytes[] memory inputs = new bytes[](1);
        // 0.0001% = 1e12 (precision beyond bips)
        inputs[0] = abi.encode(address(erc20), RECIPIENT, 1e12);

        erc20.mint(address(router), AMOUNT);
        assertEq(erc20.balanceOf(RECIPIENT), 0);

        router.execute(commands, inputs);

        // 1e18 * 1e12 / 1e18 = 1e12
        assertEq(erc20.balanceOf(RECIPIENT), 1e12);
    }
}
