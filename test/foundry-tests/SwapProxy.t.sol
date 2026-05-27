// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {SwapProxy} from '../../contracts/SwapProxy.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {MockERC20} from './mock/MockERC20.sol';

contract SwapProxyTest is Test {
    uint256 constant AMOUNT = 1 ether;
    uint256 constant BALANCE = 100000 ether;
    IUniswapV2Factory constant FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    ERC20 constant WETH9 = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    address USER = address(0xBEEF);

    UniversalRouter router;
    SwapProxy proxy;
    MockERC20 tokenA;
    MockERC20 tokenB;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 20010000);

        RouterParameters memory params = RouterParameters({
            permit2: address(PERMIT2),
            weth9: address(WETH9),
            v2Factory: address(FACTORY),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
        proxy = new SwapProxy();

        // Create mock tokens and V2 pair
        tokenA = new MockERC20();
        tokenB = new MockERC20();

        // Ensure tokenA < tokenB for consistent ordering
        if (address(tokenA) > address(tokenB)) {
            (tokenA, tokenB) = (tokenB, tokenA);
        }

        address pair = FACTORY.createPair(address(tokenA), address(tokenB));
        tokenA.mint(pair, 100 ether);
        tokenB.mint(pair, 100 ether);
        IUniswapV2Pair(pair).sync();

        // Fund user and approve proxy (NOT Permit2)
        vm.startPrank(USER);
        tokenA.mint(USER, BALANCE);
        tokenB.mint(USER, BALANCE);
        ERC20(address(tokenA)).approve(address(proxy), type(uint256).max);
        ERC20(address(tokenB)).approve(address(proxy), type(uint256).max);
    }

    function testExactInputViaProxy() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        bytes[] memory inputs = new bytes[](1);
        // payerIsUser=false, recipient=USER (explicit address, not MSG_SENDER)
        inputs[0] = abi.encode(USER, AMOUNT, 0, path, false, new uint256[](0));

        uint256 balanceBefore = tokenB.balanceOf(USER);

        proxy.execute(
            IUniversalRouter(address(router)), address(tokenA), AMOUNT, commands, inputs, block.timestamp + 1000
        );

        assertEq(tokenA.balanceOf(USER), BALANCE - AMOUNT);
        assertGt(tokenB.balanceOf(USER), balanceBefore);
    }

    function testExactOutputViaProxyWithSweep() public {
        uint256 maxIn = 2 ether; // overfund to test sweep
        uint256 desiredOut = AMOUNT;

        bytes memory commands =
            abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)), bytes1(uint8(Commands.SWEEP)));
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        bytes[] memory inputs = new bytes[](2);
        // payerIsUser=false, recipient=USER
        inputs[0] = abi.encode(USER, desiredOut, maxIn, path, false, new uint256[](0));
        // sweep leftover tokenA back to USER
        inputs[1] = abi.encode(address(tokenA), USER, 0);

        uint256 tokenABefore = tokenA.balanceOf(USER);
        uint256 tokenBBefore = tokenB.balanceOf(USER);

        proxy.execute(
            IUniversalRouter(address(router)), address(tokenA), maxIn, commands, inputs, block.timestamp + 1000
        );

        // User received exact output
        assertGe(tokenB.balanceOf(USER), tokenBBefore + desiredOut);
        // User paid less than maxIn (excess swept back)
        assertGt(tokenA.balanceOf(USER), tokenABefore - maxIn);
        // No tokens stuck in the router
        assertEq(tokenA.balanceOf(address(router)), 0);
    }

    function testRevertOnInsufficientApproval() public {
        // Revoke approval
        ERC20(address(tokenA)).approve(address(proxy), 0);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(USER, AMOUNT, 0, path, false, new uint256[](0));

        vm.expectRevert();
        proxy.execute(
            IUniversalRouter(address(router)), address(tokenA), AMOUNT, commands, inputs, block.timestamp + 1000
        );
    }

    function testRevertOnExpiredDeadline() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(USER, AMOUNT, 0, path, false, new uint256[](0));

        vm.expectRevert(IUniversalRouter.TransactionDeadlinePassed.selector);
        proxy.execute(IUniversalRouter(address(router)), address(tokenA), AMOUNT, commands, inputs, block.timestamp - 1);
    }

    function testNoTokensStuckInProxy() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(USER, AMOUNT, 0, path, false, new uint256[](0));

        proxy.execute(
            IUniversalRouter(address(router)), address(tokenA), AMOUNT, commands, inputs, block.timestamp + 1000
        );

        // Proxy should never hold tokens
        assertEq(tokenA.balanceOf(address(proxy)), 0);
        assertEq(tokenB.balanceOf(address(proxy)), 0);
        // Router should not hold tokens either
        assertEq(tokenA.balanceOf(address(router)), 0);
    }

    function testGasComparisonDirectVsProxy() public {
        // Setup: also approve Permit2 for direct comparison
        ERC20(address(tokenA)).approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(tokenA), address(router), type(uint160).max, type(uint48).max);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        // Gas via proxy
        bytes memory proxyCommands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory proxyInputs = new bytes[](1);
        proxyInputs[0] = abi.encode(USER, AMOUNT, 0, path, false, new uint256[](0));

        uint256 gasBefore = gasleft();
        proxy.execute(
            IUniversalRouter(address(router)),
            address(tokenA),
            AMOUNT,
            proxyCommands,
            proxyInputs,
            block.timestamp + 1000
        );
        uint256 gasProxy = gasBefore - gasleft();

        // Gas via direct Permit2
        bytes memory directCommands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory directInputs = new bytes[](1);
        directInputs[0] = abi.encode(USER, AMOUNT, 0, path, true, new uint256[](0));

        gasBefore = gasleft();
        router.execute(directCommands, directInputs);
        uint256 gasDirect = gasBefore - gasleft();

        emit log_named_uint('Gas via proxy', gasProxy);
        emit log_named_uint('Gas via direct Permit2', gasDirect);
        emit log_named_uint('Gas overhead', gasProxy > gasDirect ? gasProxy - gasDirect : 0);
    }
}
