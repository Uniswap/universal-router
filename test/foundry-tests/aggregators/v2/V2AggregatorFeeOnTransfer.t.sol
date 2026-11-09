// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../_AggregatorBase.t.sol';
import {MockFoTToken} from './mocks/MockFoTToken.sol';
import {UniswapV2AggregatorMock} from './mocks/UniswapV2AggregatorMock.sol';
import {Commands} from '../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorFeeOnTransfer
/// @notice Fee-on-transfer behavior tests. The aggregator hook handles FoT for exact-in by
///         reading post-take pair balance (`amountArrived = balanceTakeAfter - balanceTakeBefore`).
///         Exact-out with FoT input is documented as unsupported — the pair receives less than
///         `getAmountIn` and the K-invariant check inside `pair.swap` reverts.
contract V2AggregatorFeeOnTransfer is AggregatorBase {
    MockFoTToken internal fotToken;
    MockFoTToken internal vanillaToken; // 0 fee → vanilla ERC20 semantics
    address internal fotPair;
    PoolKey internal fotPoolKey;

    function setUp() public override {
        super.setUp();
        if (!forked) return;

        // Two mock tokens: one with 2% FoT, one vanilla. Use deterministic CREATE so the V2
        // factory sorts them predictably. Mint both to this contract for seeding the pair.
        fotToken = new MockFoTToken('FoT', 'FOT', 18, 200); // 2% fee on transfer
        vanillaToken = new MockFoTToken('Plain', 'PLAIN', 18, 0); // 0% = vanilla

        // Create a V2 pair via the real mainnet factory.
        fotPair = V2_FACTORY.createPair(address(fotToken), address(vanillaToken));

        // Seed the pair with liquidity. For FoT, the pair's balance ≠ deposited amount; sync first.
        uint256 fotSeed = 1_000_000 ether;
        uint256 vanillaSeed = 1_000_000 ether;
        fotToken.mint(fotPair, fotSeed);
        vanillaToken.mint(fotPair, vanillaSeed);
        IUniswapV2Pair(fotPair).sync();

        // Initialize V2-aggregator pool for the new pair.
        (fotPoolKey,) = _initializeV2AggPool(address(fotToken), address(vanillaToken));
    }

    /// @dev Exact-in with FoT input: hook's `amountArrived` accounts for the 2% transfer fee,
    ///      so the V2 swap is sized against the actually-arrived amount.
    function test_v2Agg_feeOnTransfer_exactIn_success() public onlyForked {
        uint128 amountIn = 1_000 ether;
        fotToken.mint(alice, amountIn);

        vm.startPrank(alice);
        fotToken.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(fotToken), address(router), type(uint160).max, type(uint48).max);
        vm.stopPrank();

        bool zeroForOne = address(fotToken) < address(vanillaToken);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        // Use OPEN_DELTA so the swap sizes against actually-arrived input post-FoT, not the
        // pre-fee `amountIn`. SETTLE pulls amountIn from alice → PM receives `amountIn * 0.98`.
        // The router has a +0.98*amountIn credit; OPEN_DELTA picks that up.
        inputs[0] = _planExactInOpenDelta(
            fotPoolKey, zeroForOne, amountIn, Currency.wrap(address(fotToken)), Currency.wrap(address(vanillaToken))
        );

        uint256 vanillaBefore = vanillaToken.balanceOf(alice);

        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);

        assertGt(vanillaToken.balanceOf(alice), vanillaBefore, 'FoT exact-in produced no output');
        assertEq(fotToken.balanceOf(alice), 0, 'FoT input not fully spent');
    }

    /// @dev Exact-in encoder that settles `amountIn` but uses `OPEN_DELTA` for the swap size
    ///      so post-FoT credit is consumed instead of the pre-fee specified amount.
    function _planExactInOpenDelta(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE_ALL)
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountIn), true);
        params[1] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: ActionConstants.OPEN_DELTA, // size against post-FoT credit
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        params[2] = abi.encode(currencyOut, uint256(0));
        return abi.encode(actions, params);
    }

    /// @dev Exact-out with FoT input: documented limitation. The hook calls `getAmountIn`
    ///      against expected reserves and `take`s exactly that amount, but FoT means the pair
    ///      receives less than `take` sent. The pair's K-invariant check then reverts.
    function test_v2Agg_feeOnTransfer_exactOut_reverts() public onlyForked {
        uint128 amountOut = 100 ether;
        uint128 amountInMax = 200 ether;
        fotToken.mint(alice, amountInMax);

        vm.startPrank(alice);
        fotToken.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(fotToken), address(router), type(uint160).max, type(uint48).max);
        vm.stopPrank();

        bool zeroForOne = address(fotToken) < address(vanillaToken);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactOut(
            fotPoolKey,
            zeroForOne,
            amountInMax,
            amountOut,
            Currency.wrap(address(fotToken)),
            Currency.wrap(address(vanillaToken))
        );

        vm.prank(alice);
        vm.expectRevert(); // K invariant fails inside pair.swap
        router.execute(commands, inputs, block.timestamp);
    }

    function _planExactIn(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE_ALL)
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountIn), true);
        params[1] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        params[2] = abi.encode(currencyOut, uint256(0));
        return abi.encode(actions, params);
    }

    function _planExactOut(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountInMax,
        uint128 amountOut,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_OUT_SINGLE), uint8(Actions.TAKE_ALL)
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountInMax), true);
        params[1] = abi.encode(
            IV4Router.ExactOutputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountOut: amountOut,
                amountInMaximum: amountInMax,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        params[2] = abi.encode(currencyOut, uint256(amountOut));
        return abi.encode(actions, params);
    }
}
