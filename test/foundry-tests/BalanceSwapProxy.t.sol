// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ISignatureTransfer} from 'permit2/src/interfaces/ISignatureTransfer.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {BalanceSwapProxy} from '../../contracts/BalanceSwapProxy.sol';
import {IBalanceSwapProxy} from '../../contracts/interfaces/IBalanceSwapProxy.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {MockERC20} from './mock/MockERC20.sol';

contract BalanceSwapProxyTest is Test {
    uint256 constant AMOUNT = 1 ether;
    uint256 constant BALANCE = 100000 ether;
    IUniswapV2Factory constant FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    ERC20 constant WETH9 = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    uint256 constant OWNER_KEY = 0xA11CE;
    address OWNER;
    address RECIPIENT = address(0x4EC1);

    UniversalRouter router;
    BalanceSwapProxy proxy;
    MockERC20 tokenA;
    MockERC20 tokenB;
    address pairAB;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 20010000);
        OWNER = vm.addr(OWNER_KEY);

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
        proxy = new BalanceSwapProxy(PERMIT2);

        tokenA = new MockERC20();
        tokenB = new MockERC20();
        if (address(tokenA) > address(tokenB)) (tokenA, tokenB) = (tokenB, tokenA);

        pairAB = FACTORY.createPair(address(tokenA), address(tokenB));
        tokenA.mint(pairAB, 100 ether);
        tokenB.mint(pairAB, 100 ether);
        IUniswapV2Pair(pairAB).sync();

        tokenA.mint(OWNER, BALANCE);
    }

    // ---------- shared helpers ----------

    function _v2Route(address tokenIn_, address tokenOut_, address recipient_)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = tokenIn_;
        path[1] = tokenOut_;
        inputs = new bytes[](1);
        // recipient explicit, amountIn = CONTRACT_BALANCE, payerIsUser = false
        inputs[0] = abi.encode(recipient_, ActionConstants.CONTRACT_BALANCE, 0, path, false, new uint256[](0));
    }

    function _intent(address tokenOut_, address recipient_, uint256 minPriceX36_, uint256 minAmount_)
        internal
        view
        returns (IBalanceSwapProxy.SwapIntent memory)
    {
        return IBalanceSwapProxy.SwapIntent({
            router: address(router),
            tokenOut: tokenOut_,
            recipient: recipient_,
            minPriceX36: minPriceX36_,
            minAmount: minAmount_
        });
    }

    function _expectedOut(uint256 amountIn, address pairAddr, address tokenIn_) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pairAddr).getReserves();
        (uint256 rin, uint256 rout) =
            tokenIn_ == IUniswapV2Pair(pairAddr).token0() ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        return amountIn * 997 * rout / (rin * 1000 + amountIn * 997);
    }

    // ---------- Mode 2a: direct, ERC20 approval ----------

    function testDirectExecuteSwapsFullBalance() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT); // leave exactly AMOUNT as the "full balance"
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0.9e36, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();

        assertEq(tokenA.balanceOf(OWNER), 0, 'full balance consumed');
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut, 'recipient got the output');
        assertEq(tokenA.balanceOf(address(router)), 0, 'no residue in router');
        assertEq(tokenA.balanceOf(address(proxy)), 0, 'no residue in proxy');
    }

    function testDirectRevertsSameToken() public {
        vm.startPrank(OWNER);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenA), RECIPIENT);
        vm.expectRevert(IBalanceSwapProxy.SameToken.selector);
        proxy.execute(
            address(tokenA), _intent(address(tokenA), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectRevertsZeroBalance() public {
        address broke = address(0xB0B);
        vm.startPrank(broke);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert(abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0, 0));
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectRevertsBelowMinAmount() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - 0.01 ether); // leave dust
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0.01 ether, 0.5 ether)
        );
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0.5 ether), commands, inputs,
            block.timestamp + 1000
        );
        vm.stopPrank();
    }

    /// @dev With amount = 1e18, floor = amount * minPriceX36 / 1e36 = minPriceX36 / 1e18 exactly —
    ///      so minPriceX36 = expectedOut * 1e18 puts the floor at precisely expectedOut.
    function testDirectFloorBoundaryExact() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        // floor == expectedOut exactly: passes
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, expectedOut * 1e18, 0), commands, inputs,
            block.timestamp + 1000
        );
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut);
        vm.stopPrank();
    }

    function testDirectFloorBoundaryRevert() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        // floor == expectedOut + 1: reverts
        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientOutput.selector, expectedOut, expectedOut + 1)
        );
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, (expectedOut + 1) * 1e18, 0), commands, inputs,
            block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectFloorDisabled() public {
        // minPriceX36 = 0 skips the check even for an awful price (whole BALANCE into a small pool)
        vm.startPrank(OWNER);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        assertEq(tokenA.balanceOf(OWNER), 0);
        assertGt(tokenB.balanceOf(RECIPIENT), 0);
        vm.stopPrank();
    }

    function testDirectRevertsWithoutApproval() public {
        vm.startPrank(OWNER);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert();
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    // ---------- Mode 2b: direct, Permit2 allowance ----------

    function testPermit2AllowanceExecuteSwapsFullBalance() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(tokenA), address(proxy), type(uint160).max, type(uint48).max);

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        proxy.executeWithPermit2Allowance(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0.9e36, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();

        assertEq(tokenA.balanceOf(OWNER), 0);
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenA.balanceOf(address(proxy)), 0);
    }

    function testPermit2AllowanceRevertsWithoutPermit2Approval() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        // note: no PERMIT2.approve(tokenA, proxy, ...) — the proxy has no allowance
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert();
        proxy.executeWithPermit2Allowance(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }
}
