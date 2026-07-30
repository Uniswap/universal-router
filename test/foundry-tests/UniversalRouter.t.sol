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
import {BytesLib} from '../../contracts/modules/uniswap/v3/BytesLib.sol';
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
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
        testModule = new ExampleModule();
        erc20 = new MockERC20();
    }

    event ExampleModuleEvent(string message);

    function test_bytecodeSize() public {
        vm.snapshotValue('UniversalRouter bytecode size', address(router).code.length);
    }

    function testCallModule() public {
        uint256 bytecodeSize;
        address theRouter = address(router);
        assembly {
            bytecodeSize := extcodesize(theRouter)
        }
        emit log_uint(bytecodeSize);
    }

    function testRejectsShortStaticCommandInputs() public {
        uint256[] memory commandTypes = new uint256[](14);
        uint256[] memory minimumLengths = new uint256[](14);

        commandTypes[0] = Commands.V3_SWAP_EXACT_IN;
        commandTypes[1] = Commands.V3_SWAP_EXACT_OUT;
        commandTypes[2] = Commands.PERMIT2_TRANSFER_FROM;
        commandTypes[3] = Commands.SWEEP;
        commandTypes[4] = Commands.TRANSFER;
        commandTypes[5] = Commands.PAY_PORTION;
        commandTypes[6] = Commands.PAY_PORTION_FULL_PRECISION;
        commandTypes[7] = Commands.V2_SWAP_EXACT_IN;
        commandTypes[8] = Commands.V2_SWAP_EXACT_OUT;
        commandTypes[9] = Commands.PERMIT2_PERMIT;
        commandTypes[10] = Commands.WRAP_ETH;
        commandTypes[11] = Commands.UNWRAP_WETH;
        commandTypes[12] = Commands.BALANCE_CHECK_ERC20;
        commandTypes[13] = Commands.V4_INITIALIZE_POOL;

        minimumLengths[0] = 0xc0;
        minimumLengths[1] = 0xc0;
        minimumLengths[2] = 0x60;
        minimumLengths[3] = 0x60;
        minimumLengths[4] = 0x60;
        minimumLengths[5] = 0x60;
        minimumLengths[6] = 0x60;
        minimumLengths[7] = 0xc0;
        minimumLengths[8] = 0xc0;
        minimumLengths[9] = 0xe0;
        minimumLengths[10] = 0x40;
        minimumLengths[11] = 0x40;
        minimumLengths[12] = 0x60;
        minimumLengths[13] = 0xc0;

        bytes[] memory inputs = new bytes[](1);
        for (uint256 i; i < commandTypes.length; ++i) {
            bytes memory commands = abi.encodePacked(bytes1(uint8(commandTypes[i])));
            inputs[0] = new bytes(minimumLengths[i] - 1);

            vm.expectRevert(BytesLib.SliceOutOfBounds.selector);
            router.execute(commands, inputs);
        }
    }

    function testRejectsShortDynamicCommandInputs() public {
        uint256[] memory commandTypes = new uint256[](5);
        commandTypes[0] = Commands.PERMIT2_PERMIT_BATCH;
        commandTypes[1] = Commands.PERMIT2_TRANSFER_FROM_BATCH;
        commandTypes[2] = Commands.V3_POSITION_MANAGER_PERMIT;
        commandTypes[3] = Commands.V3_POSITION_MANAGER_CALL;
        commandTypes[4] = Commands.V4_POSITION_MANAGER_CALL;

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = hex'';

        for (uint256 i; i < commandTypes.length; ++i) {
            bytes memory commands = abi.encodePacked(bytes1(uint8(commandTypes[i])));

            vm.expectRevert(BytesLib.SliceOutOfBounds.selector);
            router.execute(commands, inputs);
        }
    }

    function testPermit2PermitBatchDecodesBoundedDetails() public {
        IAllowanceTransfer.PermitDetails[] memory details = new IAllowanceTransfer.PermitDetails[](1);
        details[0] = IAllowanceTransfer.PermitDetails({
            token: address(erc20), amount: 1 ether, expiration: type(uint48).max, nonce: 0
        });
        IAllowanceTransfer.PermitBatch memory permitBatch =
            IAllowanceTransfer.PermitBatch({details: details, spender: address(router), sigDeadline: block.timestamp});

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_PERMIT_BATCH)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(permitBatch, hex'');

        router.execute(commands, inputs);
    }

    function testPermit2PermitBatchRejectsTruncatedDetails() public {
        IAllowanceTransfer.PermitDetails[] memory details = new IAllowanceTransfer.PermitDetails[](1);
        details[0] = IAllowanceTransfer.PermitDetails({
            token: address(erc20), amount: 1 ether, expiration: type(uint48).max, nonce: 0
        });
        IAllowanceTransfer.PermitBatch memory permitBatch =
            IAllowanceTransfer.PermitBatch({details: details, spender: address(router), sigDeadline: block.timestamp});

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_PERMIT_BATCH)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(permitBatch, hex'');

        assembly {
            mstore(mload(add(inputs, 0x20)), 0x120)
        }

        vm.expectRevert(BytesLib.SliceOutOfBounds.selector);
        router.execute(commands, inputs);
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
