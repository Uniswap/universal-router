// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../_AggregatorBase.t.sol';
import {UniswapV2AggregatorMock} from './mocks/UniswapV2AggregatorMock.sol';
import {Commands} from '../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorNative
/// @notice Native-ETH composition tests for V4_SWAP-against-V2AggHook. The hook explicitly
///         rejects `Currency(address(0))`, so ETH-in/out swaps must be wrapped/unwrapped at
///         the UR command boundary using `WRAP_ETH` / `UNWRAP_WETH`.
contract V2AggregatorNative is AggregatorBase {
    /// @dev Initializing a V4 pool with native ETH currency against the aggregator must revert.
    ///      v4-core wraps the hook's revert in `WrappedError` (selector + inner data + context);
    ///      the inner data contains `NativeCurrencyNotSupported()`'s selector.
    function test_v2Agg_nativeCurrencyInitialize_reverts() public onlyForked {
        PoolKey memory bogus = PoolKey({
            currency0: Currency.wrap(address(0)), // native ETH
            currency1: Currency.wrap(address(USDC)),
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook))
        });

        vm.expectRevert(); // wrapped error envelope; inner is NativeCurrencyNotSupported()
        poolManager.initialize(bogus, SQRT_PRICE_1_1);
    }

    /// @dev ETH-in: alice sends ETH; UR wraps it; V4 plan settles WETH from the router and
    ///      swaps WETH → APE via V2Agg. APE flows to alice.
    function test_v2Agg_ethIn_wrapThenSwap_success() public onlyForked {
        uint256 amountIn = 1 ether;
        (PoolKey memory key,) = _initializeV2AggPool(address(WETH9), address(APE));
        vm.deal(alice, amountIn + 1 ether); // extra for gas

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.WRAP_ETH)), bytes1(uint8(Commands.V4_SWAP)));

        bool zeroForOne = address(WETH9) < address(APE);

        bytes memory v4Actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE_ALL));
        bytes[] memory v4Params = new bytes[](3);
        // After WRAP_ETH, the router holds amountIn of WETH. Settle from router's balance.
        v4Params[0] = abi.encode(Currency.wrap(address(WETH9)), ActionConstants.CONTRACT_BALANCE, /*payerIsUser*/ false);
        v4Params[1] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: uint128(amountIn),
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        v4Params[2] = abi.encode(Currency.wrap(address(APE)), uint256(0));

        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(ActionConstants.ADDRESS_THIS, amountIn);
        inputs[1] = abi.encode(v4Actions, v4Params);

        uint256 apeBefore = APE.balanceOf(alice);
        vm.prank(alice);
        router.execute{value: amountIn}(commands, inputs, block.timestamp);
        assertGt(APE.balanceOf(alice), apeBefore, 'APE not received from ETH-in swap');
        assertEq(WETH9.balanceOf(address(router)), 0, 'router holds residual WETH');
    }

    /// @dev ETH-out: alice's APE swap into WETH lands on the router, then UNWRAP_WETH sends ETH to alice.
    function test_v2Agg_ethOut_swapThenUnwrap_success() public onlyForked {
        uint256 amountIn = 100 ether; // 100 APE
        (PoolKey memory key,) = _initializeV2AggPool(address(WETH9), address(APE));
        _fundAndApprove(alice, APE, amountIn);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)), bytes1(uint8(Commands.UNWRAP_WETH)));

        bool zeroForOne = address(APE) < address(WETH9);

        bytes memory v4Actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE));
        bytes[] memory v4Params = new bytes[](3);
        v4Params[0] = abi.encode(Currency.wrap(address(APE)), uint256(amountIn), /*payerIsUser*/ true);
        v4Params[1] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: uint128(amountIn),
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        // Take WETH to the router (ADDRESS_THIS) so UNWRAP_WETH can convert it to ETH for alice.
        v4Params[2] =
            abi.encode(Currency.wrap(address(WETH9)), ActionConstants.ADDRESS_THIS, ActionConstants.OPEN_DELTA);

        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(v4Actions, v4Params);
        inputs[1] = abi.encode(alice, uint256(0));

        uint256 ethBefore = alice.balance;
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        assertGt(alice.balance, ethBefore, 'ETH not received');
        assertEq(WETH9.balanceOf(address(router)), 0, 'router holds residual WETH');
    }
}
