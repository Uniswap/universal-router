// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../_AggregatorBase.t.sol';
import {MockFoTToken} from './mocks/MockFoTToken.sol';
import {Commands} from '../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {PathKey} from '@uniswap/v4-periphery/src/libraries/PathKey.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorIntermediateLimitation
/// @notice Failing-by-design tests that document the V2-only-intermediate exact-out limitation
///         of the current V2AggHook architecture. These tests are the acceptance criteria for
///         the new flash-swap-based hook design — they SHOULD start passing once the new hook
///         (which uses nested V2 flash-swap callbacks) replaces the pre-take pattern.
///
/// @dev The current V2AggHook does `poolManager.take(input, pair, amountIn)` BEFORE calling
///      `pair.swap`. For V4Router's `SWAP_EXACT_OUT` multi-hop, the chain walks BACKWARD, so
///      the V2-only intermediate token needs to be in PoolManager when the backward step that
///      consumes it runs — but the forward step that would deposit it hasn't executed yet.
///
///      The new design (flash-swap-based hook) uses `pair.swap(amountOut, hook, data)` with a
///      callback, which lets the pair extend credit. Inside the callback, the hook can either
///      take from PM (if available) or recurse into the previous hop's flash-swap. This breaks
///      the dependency on PM holding the intermediate token.
///
///      See `.claude-output/flash-swap-restructure-2026-05-20.md` for the full design.
contract V2AggregatorIntermediateLimitation is AggregatorBase {
    MockFoTToken internal v2OnlyMid;
    address internal pairWethMid;
    address internal pairMidUsdc;
    PoolKey internal v2AggKey_WETH_MID;
    PoolKey internal v2AggKey_MID_USDC;

    function setUp() public override {
        super.setUp();
        if (!forked) return;

        // Deploy a mock token that has NO V4 pool anywhere — strictly V2-only.
        v2OnlyMid = new MockFoTToken('V2OnlyMid', 'V2M', 18, 0); // 0% FoT = vanilla ERC20

        // Create two V2 pairs via the real mainnet factory:
        //   1) WETH / V2OnlyMid
        //   2) V2OnlyMid / USDC
        // Both pairs are real Uniswap V2 pairs with real K-invariants.
        pairWethMid = V2_FACTORY.createPair(address(WETH9), address(v2OnlyMid));
        pairMidUsdc = V2_FACTORY.createPair(address(v2OnlyMid), address(USDC));

        // Seed reserves. Use deal() for the real tokens and mint() for the mock.
        deal(address(WETH9), pairWethMid, 10_000 ether);
        v2OnlyMid.mint(pairWethMid, 10_000_000 ether);
        IUniswapV2Pair(pairWethMid).sync();

        v2OnlyMid.mint(pairMidUsdc, 10_000_000 ether);
        deal(address(USDC), pairMidUsdc, 10_000_000e6);
        IUniswapV2Pair(pairMidUsdc).sync();

        // Initialize V4 pools (one per V2 pair) on the V2-aggregator hook.
        (v2AggKey_WETH_MID,) = _initializeV2AggPool(address(WETH9), address(v2OnlyMid));
        (v2AggKey_MID_USDC,) = _initializeV2AggPool(address(v2OnlyMid), address(USDC));
    }

    /// @dev EXPECTED FAIL with current architecture. The route WETH → V2OnlyMid → USDC has a
    ///      V2-only intermediate (`V2OnlyMid`). With `SWAP_EXACT_OUT` (PathKey[]), V4Router
    ///      walks backward: the V2Agg(V2OnlyMid → USDC) step runs first, but PM holds zero
    ///      V2OnlyMid (no V4 pool, no prior deposit), so the hook's `take(V2OnlyMid, ...)`
    ///      reverts inside the V2 pair's transfer.
    ///
    ///      Under the new flash-swap-based hook, the pair extends credit via `pair.swap(...,
    ///      data)` and the callback chains backward via nested flash-swaps. This test should
    ///      flip from `vm.expectRevert` to a success assertion once the new hook ships.
    function test_v2Agg_exactOut_v2OnlyIntermediate_reverts_currentArchitecture() public onlyForked {
        uint128 amountOut = 100e6; // 100 USDC out
        uint128 amountInMax = 5 ether; // 5 WETH max in

        _fundAndApprove(alice, WETH9, amountInMax);

        // Build the V4 plan: SWAP_EXACT_OUT(path=[WETH→MID, MID→USDC]) → SETTLE_ALL → TAKE_ALL.
        // path[i].intermediateCurrency = INPUT of hop i (v4-periphery exact-out convention)
        PathKey[] memory path = new PathKey[](2);
        path[0] = PathKey({
            intermediateCurrency: Currency.wrap(address(WETH9)),
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook)),
            hookData: bytes('')
        });
        path[1] = PathKey({
            intermediateCurrency: Currency.wrap(address(v2OnlyMid)),
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook)),
            hookData: bytes('')
        });

        bytes memory actions =
            abi.encodePacked(uint8(Actions.SWAP_EXACT_OUT), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactOutputParams({
                currencyOut: Currency.wrap(address(USDC)),
                path: path,
                minHopPriceX36: new uint256[](0),
                amountOut: amountOut,
                amountInMaximum: amountInMax
            })
        );
        params[1] = abi.encode(Currency.wrap(address(WETH9)), uint256(amountInMax));
        params[2] = abi.encode(Currency.wrap(address(USDC)), uint256(amountOut));

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        vm.prank(alice);
        vm.expectRevert(); // Current architecture: take(V2OnlyMid) reverts because PM has 0
        router.execute(commands, inputs, block.timestamp);
    }

    /// @dev EXPECTED PASS — proves the chain DOES work for exact-IN (forward walk pre-funds PM
    ///      with V2OnlyMid via the first hop's settle). Same chain, opposite direction.
    function test_v2Agg_exactIn_v2OnlyIntermediate_success_forwardWalk() public onlyForked {
        uint128 amountIn = 1 ether; // 1 WETH

        _fundAndApprove(alice, WETH9, amountIn);

        // Forward exact-in path: WETH → V2OnlyMid → USDC
        PathKey[] memory path = new PathKey[](2);
        path[0] = PathKey({
            intermediateCurrency: Currency.wrap(address(v2OnlyMid)), // OUTPUT of hop 0
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook)),
            hookData: bytes('')
        });
        path[1] = PathKey({
            intermediateCurrency: Currency.wrap(address(USDC)), // OUTPUT of hop 1
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook)),
            hookData: bytes('')
        });

        bytes memory actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            Currency.wrap(address(WETH9)),
            uint256(amountIn),
            /*payerIsUser*/
            true
        );
        params[1] = abi.encode(
            IV4Router.ExactInputParams({
                currencyIn: Currency.wrap(address(WETH9)),
                path: path,
                minHopPriceX36: new uint256[](0),
                amountIn: amountIn,
                amountOutMinimum: 0
            })
        );
        params[2] = abi.encode(Currency.wrap(address(USDC)), uint256(0));

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        uint256 usdcBefore = USDC.balanceOf(alice);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        // Should succeed: forward walk deposits V2OnlyMid into PM via hop 0's settle, then
        // hop 1's hook take()s it from PM. The V2-only intermediate flows naturally.
        assertGt(USDC.balanceOf(alice), usdcBefore, 'USDC not received via V2-only intermediate forward walk');
    }
}
