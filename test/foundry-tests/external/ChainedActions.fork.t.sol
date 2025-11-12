// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from 'forge-std/Test.sol';
import {RouterParameters} from '../../../contracts/types/RouterParameters.sol';
import {UniversalRouter, Commands} from '../../../contracts/UniversalRouter.sol';
import {AcrossV4DepositV3Params} from '../../../contracts/interfaces/IUniversalRouter.sol';
import {IWETH9} from '@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';

contract ChainedActionsFork is Test {
    address constant ACROSS_SPOKE_POOL = 0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5;
    IWETH9 constant WETH9 = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address constant WETH_UNICHAIN = 0x4200000000000000000000000000000000000006;

    UniversalRouter router;
    bool forked;

    function setUp() public {
        try vm.envString('INFURA_API_KEY') returns (string memory) {
            console2.log('Forked Ethereum mainnet');
            // Fork mainnet at a specific block for consistency
            vm.createSelectFork(vm.rpcUrl('mainnet'), 23_000_000);

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
                spokePool: ACROSS_SPOKE_POOL
            });
            router = new UniversalRouter(params);

            WETH9.deposit{value: 1 ether}();

            forked = true;
        } catch {
            console2.log(
                'Skipping forked tests, no infura key found. Add INFURA_API_KEY env var to .env to run forked tests.'
            );
        }
    }

    modifier onlyForked() {
        if (forked) {
            console2.log('running forked test');
            _;
            return;
        }
        console2.log('skipping forked test');
    }

    function test_depositERC20() public onlyForked {
        uint256 balanceBefore = WETH9.balanceOf(ACROSS_SPOKE_POOL);
        WETH9.transfer(address(router), 1 ether);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.ACROSS_V4_DEPOSIT_V3)));
        AcrossV4DepositV3Params memory params = AcrossV4DepositV3Params({
            depositor: address(this),
            recipient: address(this),
            inputToken: address(WETH9),
            outputToken: WETH_UNICHAIN,
            inputAmount: 1 ether,
            outputAmount: 1 ether,
            destinationChainId: 130,
            exclusiveRelayer: address(0),
            quoteTimestamp: uint32(block.timestamp),
            fillDeadline: uint32(block.timestamp + 1 hours),
            exclusivityDeadline: 0,
            message: bytes(''),
            useNative: false
        });
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(params);
        router.execute(commands, inputs, block.timestamp);
        assertEq(WETH9.balanceOf(address(router)), 0);
        assertEq(WETH9.balanceOf(ACROSS_SPOKE_POOL), balanceBefore + 1 ether);
    }

    function test_depositNative() public onlyForked {
        uint256 routerBalanceBefore = address(router).balance;
        // ETH is wrapped as WETH9
        uint256 spokePoolBalanceBefore = WETH9.balanceOf(ACROSS_SPOKE_POOL);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.ACROSS_V4_DEPOSIT_V3)));
        AcrossV4DepositV3Params memory params = AcrossV4DepositV3Params({
            depositor: address(this),
            recipient: address(this),
            inputToken: address(WETH9),
            outputToken: WETH_UNICHAIN,
            inputAmount: 1 ether,
            outputAmount: 1 ether,
            destinationChainId: 130,
            exclusiveRelayer: address(0),
            quoteTimestamp: uint32(block.timestamp),
            fillDeadline: uint32(block.timestamp + 1 hours),
            exclusivityDeadline: 0,
            message: bytes(''),
            useNative: true
        });
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(params);
        router.execute{value: 1 ether}(commands, inputs, block.timestamp);
        assertEq(address(router).balance, routerBalanceBefore);
        assertEq(WETH9.balanceOf(ACROSS_SPOKE_POOL), spokePoolBalanceBefore + 1 ether);
    }

    function test_depositERC20WithContractBalance() public onlyForked {
        uint256 balanceBefore = WETH9.balanceOf(ACROSS_SPOKE_POOL);
        WETH9.transfer(address(router), 1 ether);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.ACROSS_V4_DEPOSIT_V3)));
        AcrossV4DepositV3Params memory params = AcrossV4DepositV3Params({
            depositor: address(this),
            recipient: address(this),
            inputToken: address(WETH9),
            outputToken: WETH_UNICHAIN,
            inputAmount: ActionConstants.CONTRACT_BALANCE,
            outputAmount: 1 ether,
            destinationChainId: 130,
            exclusiveRelayer: address(0),
            quoteTimestamp: uint32(block.timestamp),
            fillDeadline: uint32(block.timestamp + 1 hours),
            exclusivityDeadline: 0,
            message: bytes(''),
            useNative: false
        });
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(params);
        router.execute(commands, inputs, block.timestamp);
        assertEq(WETH9.balanceOf(address(router)), 0);
        assertEq(WETH9.balanceOf(ACROSS_SPOKE_POOL), balanceBefore + 1 ether);
    }

    function test_depositNativeWithContractBalance() public onlyForked {
        uint256 routerBalanceBefore = address(router).balance;
        uint256 totalDepositAmount = routerBalanceBefore + 1 ether;
        // ETH is wrapped as WETH9
        uint256 spokePoolBalanceBefore = WETH9.balanceOf(ACROSS_SPOKE_POOL);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.ACROSS_V4_DEPOSIT_V3)));
        AcrossV4DepositV3Params memory params = AcrossV4DepositV3Params({
            depositor: address(this),
            recipient: address(this),
            inputToken: address(WETH9),
            outputToken: WETH_UNICHAIN,
            inputAmount: ActionConstants.CONTRACT_BALANCE,
            outputAmount: totalDepositAmount,
            destinationChainId: 130,
            exclusiveRelayer: address(0),
            quoteTimestamp: uint32(block.timestamp),
            fillDeadline: uint32(block.timestamp + 1 hours),
            exclusivityDeadline: 0,
            message: bytes(''),
            useNative: true
        });
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(params);
        router.execute{value: 1 ether}(commands, inputs, block.timestamp);
        assertEq(address(router).balance, 0);
        assertEq(WETH9.balanceOf(ACROSS_SPOKE_POOL), spokePoolBalanceBefore + totalDepositAmount);
    }
}
