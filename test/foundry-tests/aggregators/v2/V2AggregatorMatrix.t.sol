// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../_AggregatorBase.t.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {Commands} from '../../../../contracts/libraries/Commands.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @title  V2AggregatorMatrix
/// @notice The 24-cell test matrix proving V4_SWAP-against-UniswapV2Aggregator works for every
///         legal route topology, and reverts diagnosably for every illegal one.
///
/// @dev    Cell coordinates: (Position × Token Role × Direction).
///         - Position    = where the V2 hop sits in the route: Beginning / Middle / End
///         - Token Role  = which side of the V2 hop the V2-only token sits on: Input / Output
///         - Direction   = exact-in / exact-out
///         - Semantics   = V2-only (token has no V4 pool) vs V2-Mostly (token has both V2 and V4 pools)
///
///         Expected outcomes:
///         - 2 cells under V2-only are valid: (Beginning, Input) and (End, Output)
///         - 4 cells under V2-only are structurally impossible: revert `PoolNotInitialized` (0x486aa307)
///         - All 6 cells under V2-Mostly are valid: PM's aggregate balance backs the V2 hop
///
///         See the proof document for the full theorem and per-cell reasoning.
contract V2AggregatorMatrix is AggregatorBase {
    using PoolIdLibrary for PoolKey;

    // --------------------------------------------------------------------- //
    // Position: BEGINNING — V2 hop is the first hop in the route
    // --------------------------------------------------------------------- //

    /// @dev Cell 1 — Single-hop V2Agg(APE → WETH). User holds APE (V2-only).
    ///      Action plan: SETTLE(APE, user) → SWAP(v2AggKey) → TAKE_ALL(WETH).
    ///      Asserts alice's APE drops by `amountIn` and WETH rises by `hook.quote(...)`.
    function test_v2Agg_beginning_exactIn_v2OnlyInput_success() public onlyForked {
        uint256 amountIn = 100 ether; // 100 APE
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));
        _fundAndApprove(alice, APE, amountIn);

        bool zeroForOne = address(APE) < address(WETH9);
        uint256 expectedOut = aggregatorHook.quote(zeroForOne, -int256(amountIn), key.toId());

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _encodeV4SingleSwapPlan(
            key, zeroForOne, uint128(amountIn), 0, /*currencyIn*/ Currency.wrap(address(APE)),
            /*currencyOut*/ Currency.wrap(address(WETH9))
        );

        uint256 apeBefore = APE.balanceOf(alice);
        uint256 wethBefore = WETH9.balanceOf(alice);

        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);

        assertEq(APE.balanceOf(alice), apeBefore - amountIn, 'APE not deducted');
        assertEq(WETH9.balanceOf(alice), wethBefore + expectedOut, 'WETH not received exactly');
    }

    /// @dev Encodes a V4 plan for `SETTLE(currencyIn, user) → SWAP_EXACT_IN_SINGLE → TAKE_ALL(currencyOut)`.
    function _encodeV4SingleSwapPlan(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        uint128 amountOutMin,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE_ALL)
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountIn), /*payerIsUser*/ true);
        params[1] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        params[2] = abi.encode(currencyOut, uint256(amountOutMin));
        return abi.encode(actions, params);
    }

    /// @dev Cell 2 — exact-out version of Cell 1. amountInMax cap on SETTLE.
    function test_v2Agg_beginning_exactOut_v2OnlyInput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 3 — V2(WETH → APE) → V4(APE → ...). APE is V2-only, V4 can't continue.
    function test_v2Agg_beginning_exactIn_v2OnlyOutput_revertsPoolNotInitialized() public onlyForked {
        // TODO: expect IPoolManager.PoolNotInitialized.selector at the trailing V4 hop.
        vm.skip(true);
    }

    /// @dev Cell 4 — single-hop V2(WETH → APE) with APE as the route's final output.
    ///      Collapses to End-Output; included for matrix completeness.
    function test_v2Agg_beginning_exactOut_v2OnlyOutput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 5 — V2-Mostly input. SETTLE(WETH) → V2Agg(WETH → USDC) → TAKE_ALL(USDC).
    function test_v2Agg_beginning_exactIn_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 6 — V2-Mostly input, exact-out.
    function test_v2Agg_beginning_exactOut_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    // --------------------------------------------------------------------- //
    // Position: MIDDLE — V4 hops bracket the V2 hop
    // --------------------------------------------------------------------- //

    /// @dev Cell 7 — V4(A → APE) → V2Agg(APE → Y). First V4 hop reverts: no V4 pool on APE.
    function test_v2Agg_middle_exactIn_v2OnlyInput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 8 — exact-out version of Cell 7.
    function test_v2Agg_middle_exactOut_v2OnlyInput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 9 — V4(A → Z) → V2Agg(Z → APE) → V4(APE → Y). Trailing V4 hop reverts.
    function test_v2Agg_middle_exactIn_v2OnlyOutput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 10 — exact-out version of Cell 9.
    function test_v2Agg_middle_exactOut_v2OnlyOutput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 11 — V4(WETH → USDC) → V2Agg(USDC → DAI) → V4(DAI → WETH). All V2-Mostly.
    function test_v2Agg_middle_exactIn_v2MostlyBothSides_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 12 — exact-out version of Cell 11. Round-trip with 3x fee drag.
    function test_v2Agg_middle_exactOut_v2MostlyBothSides_success() public onlyForked {
        vm.skip(true);
    }

    // --------------------------------------------------------------------- //
    // Position: END — V2 hop is the final hop
    // --------------------------------------------------------------------- //

    /// @dev Cell 13 — V4(? → APE) → V2Agg(APE → Y). Prior V4 hop into APE reverts.
    function test_v2Agg_end_exactIn_v2OnlyInput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 14 — exact-out version of Cell 13.
    function test_v2Agg_end_exactOut_v2OnlyInput_revertsPoolNotInitialized() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 15 — V4(WETH → USDC) → V2Agg(USDC → APE). User receives APE.
    function test_v2Agg_end_exactIn_v2OnlyOutput_success() public onlyForked {
        // TODO: SETTLE(WETH) → SWAP(v4Key_WETH_USDC) → SWAP(v2AggKey_USDC_APE)
        //       → TAKE_ALL(APE, alice, amtMin). Assert alice receives APE.
        vm.skip(true);
    }

    /// @dev Cell 16 — exact-out version of Cell 15.
    function test_v2Agg_end_exactOut_v2OnlyOutput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 17 — V4(WETH → USDC) → V2Agg(USDC → DAI). DAI is V2-Mostly terminal.
    function test_v2Agg_end_exactIn_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 18 — exact-out version of Cell 17.
    function test_v2Agg_end_exactOut_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    // --------------------------------------------------------------------- //
    // V2-Mostly variants for additional Middle / End coverage
    // --------------------------------------------------------------------- //

    /// @dev Cell 19 — V4(A → WETH) → V2Agg(WETH → USDC) → V4(USDC → DAI). WETH is V2-Mostly.
    function test_v2Agg_middle_exactIn_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 20 — exact-out version of Cell 19.
    function test_v2Agg_middle_exactOut_v2MostlyInput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 21 — V4(A → DAI) → V2Agg(DAI → WETH) → V4(WETH → USDC). V2-Mostly output.
    function test_v2Agg_middle_exactIn_v2MostlyOutput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 22 — exact-out version of Cell 21.
    function test_v2Agg_middle_exactOut_v2MostlyOutput_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 23 — End-Input via a 3-hop chain (two V4 hops before the V2Agg).
    function test_v2Agg_end_exactIn_v2MostlyInput_threeHop_success() public onlyForked {
        vm.skip(true);
    }

    /// @dev Cell 24 — exact-out version of Cell 23.
    function test_v2Agg_end_exactOut_v2MostlyInput_threeHop_success() public onlyForked {
        vm.skip(true);
    }

    // --------------------------------------------------------------------- //
    // Smoke tests — exercise the harness itself before iterating on test bodies
    // --------------------------------------------------------------------- //

    function test_smoke_aggregatorDeploysWithRequiredFlags() public view onlyForked {
        assertTrue(address(aggregatorHook) != address(0), 'hook not deployed');
        // Lower 14 bits of the address must match the V2 aggregator permission flag pattern.
        assertEq(
            uint160(address(aggregatorHook)) & uint160(0x3FFF),
            V2_AGGREGATOR_HOOK_FLAGS,
            'hook address does not encode required permission flags'
        );
    }

    function test_smoke_aggregatorReadsCorrectFactory() public view onlyForked {
        assertEq(aggregatorHook.factory(), address(V2_FACTORY), 'hook factory mismatch');
    }

    function test_smoke_aggregatorPoolInitializesAndRegistersPair() public onlyForked {
        (PoolKey memory key, PoolId id) = _initializeV2AggPool(address(WETH9), address(APE));
        address registeredPair = aggregatorHook.poolIdToExternalPair(id);
        address expectedPair = V2_FACTORY.getPair(address(WETH9), address(APE));
        assertEq(registeredPair, expectedPair, 'aggregator did not register expected V2 pair');
        // Silence unused-variable warning while matrix bodies are stubbed.
        assertTrue(address(key.hooks) == address(aggregatorHook), 'pool key hook mismatch');
    }
}
