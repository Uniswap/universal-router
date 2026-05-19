// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../_AggregatorBase.t.sol';
import {Commands} from '../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorMultiHop
/// @notice Additional composition tests beyond the matrix: differential `hook.quote` vs actual
///         execution amounts, bounded fuzz on `amountIn`, and round-trip value conservation.
contract V2AggregatorMultiHop is AggregatorBase {
    /// @dev Differential: the hook's `quote()` for an exact-in swap must match the actual output.
    function test_v2Agg_differential_quoteMatchesExecution_exactIn() public onlyForked {
        uint128 amountIn = 5 ether; // 5 WETH
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));
        _fundAndApprove(alice, WETH9, amountIn);

        bool zeroForOne = address(WETH9) < address(APE);
        uint256 quoted = aggregatorHook.quote(zeroForOne, -int256(uint256(amountIn)), key.toId());

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactIn(
            key, zeroForOne, amountIn, Currency.wrap(address(WETH9)), Currency.wrap(address(APE))
        );

        uint256 apeBefore = APE.balanceOf(alice);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        uint256 actualOut = APE.balanceOf(alice) - apeBefore;

        assertEq(actualOut, quoted, 'quote != execution output');
    }

    /// @dev Differential: the hook's `quote()` for an exact-out swap must match the actual input.
    function test_v2Agg_differential_quoteMatchesExecution_exactOut() public onlyForked {
        uint128 amountOut = 250 ether; // 250 APE
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));

        bool zeroForOne = address(WETH9) < address(APE);
        uint128 quoted = uint128(aggregatorHook.quote(zeroForOne, int256(uint256(amountOut)), key.toId()));

        _fundAndApprove(alice, WETH9, quoted);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactOut(
            key, zeroForOne, quoted, amountOut, Currency.wrap(address(WETH9)), Currency.wrap(address(APE))
        );

        uint256 wethBefore = WETH9.balanceOf(alice);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        uint256 actualIn = wethBefore - WETH9.balanceOf(alice);

        assertEq(actualIn, quoted, 'quote != actual input');
    }

    /// @dev Bounded fuzz: random amountIn within pair reserves matches the quote on actual execution.
    function testFuzz_v2Agg_singleHop_quoteIsExact(uint128 amountIn) public onlyForked {
        amountIn = uint128(bound(amountIn, 0.001 ether, 10 ether));
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));
        _fundAndApprove(alice, WETH9, amountIn);

        bool zeroForOne = address(WETH9) < address(APE);
        uint256 quoted = aggregatorHook.quote(zeroForOne, -int256(uint256(amountIn)), key.toId());

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactIn(
            key, zeroForOne, amountIn, Currency.wrap(address(WETH9)), Currency.wrap(address(APE))
        );

        uint256 apeBefore = APE.balanceOf(alice);
        vm.prank(alice);
        router.execute(commands, inputs, block.timestamp);
        assertEq(APE.balanceOf(alice) - apeBefore, quoted, 'quote drift');
    }

    function _planExactIn(
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.TAKE_ALL));
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
        uint128 amountIn,
        uint128 amountOut,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_OUT_SINGLE), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountIn), true);
        params[1] = abi.encode(
            IV4Router.ExactOutputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountOut: amountOut,
                amountInMaximum: amountIn,
                minHopPriceX36: 0,
                hookData: bytes('')
            })
        );
        params[2] = abi.encode(currencyOut, uint256(amountOut));
        return abi.encode(actions, params);
    }
}
