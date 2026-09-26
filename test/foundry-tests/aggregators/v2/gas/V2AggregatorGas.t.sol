// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../../_AggregatorBase.t.sol';
import {Commands} from '../../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {PathKey} from '@uniswap/v4-periphery/src/libraries/PathKey.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorGas
/// @notice Gas-snapshot benchmarks for V4_SWAP-against-V2AggHook routes. Snapshot names are
///         used by `forge snapshot` to detect regressions. The legacy `V2_SWAP_*` path is
///         snapshotted in `test/foundry-tests/UniswapV2.t.sol` for comparison.
///
/// @dev Snapshot key vs the legacy V2 path:
///        - Single-hop V2-only exact-in:   `v2_aggregator_singleHop_exactIn_v2OnlyInput`
///        - Single-hop V2-only exact-out:  `v2_aggregator_singleHop_exactOut_v2OnlyInput`
///        - Single-hop V2-Mostly exact-in: `v2_aggregator_singleHop_exactIn_v2MostlyInput`
///        - Two-hop V2Agg→V2Agg exact-in:  `v2_aggregator_twoHop_v2AggChain_exactIn`
///        - Three-hop V2Agg chain exact-in: `v2_aggregator_threeHop_v2AggChain_exactIn`
contract V2AggregatorGas is AggregatorBase {
    function test_gas_singleHop_exactIn_v2OnlyInput() public onlyForked {
        uint128 amountIn = 100 ether;
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));
        _fundAndApprove(alice, APE, amountIn);

        bool zeroForOne = address(APE) < address(WETH9);
        bytes memory inputs =
            _planExactIn(key, zeroForOne, amountIn, Currency.wrap(address(APE)), Currency.wrap(address(WETH9)));
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputsArr = new bytes[](1);
        inputsArr[0] = inputs;

        vm.prank(alice);
        vm.startSnapshotGas('v2_aggregator_singleHop_exactIn_v2OnlyInput');
        router.execute(commands, inputsArr, block.timestamp);
        vm.stopSnapshotGas();
    }

    function test_gas_singleHop_exactOut_v2OnlyInput() public onlyForked {
        uint128 amountOut = 0.05 ether;
        (PoolKey memory key,) = _initializeV2AggPool(address(APE), address(WETH9));
        bool zeroForOne = address(APE) < address(WETH9);
        uint128 amountIn = uint128(aggregatorHook.quote(zeroForOne, int256(uint256(amountOut)), key.toId()));
        _fundAndApprove(alice, APE, amountIn);

        bytes memory plan = _planExactOut(
            key, zeroForOne, amountIn, amountOut, Currency.wrap(address(APE)), Currency.wrap(address(WETH9))
        );
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = plan;

        vm.prank(alice);
        vm.startSnapshotGas('v2_aggregator_singleHop_exactOut_v2OnlyInput');
        router.execute(commands, inputs, block.timestamp);
        vm.stopSnapshotGas();
    }

    function test_gas_singleHop_exactIn_v2MostlyInput() public onlyForked {
        uint128 amountIn = 1_000e6; // 1000 USDC
        (PoolKey memory key,) = _initializeV2AggPool(address(USDC), address(WETH9));
        _fundAndApprove(alice, USDC, amountIn);

        bool zeroForOne = address(USDC) < address(WETH9);
        bytes memory plan =
            _planExactIn(key, zeroForOne, amountIn, Currency.wrap(address(USDC)), Currency.wrap(address(WETH9)));
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = plan;

        vm.prank(alice);
        vm.startSnapshotGas('v2_aggregator_singleHop_exactIn_v2MostlyInput');
        router.execute(commands, inputs, block.timestamp);
        vm.stopSnapshotGas();
    }

    function test_gas_twoHop_v2AggChain_exactIn() public onlyForked {
        uint128 amountIn = 1_000e6;
        _initializeV2AggPool(address(USDC), address(WETH9));
        _initializeV2AggPool(address(WETH9), address(DAI));
        _fundAndApprove(alice, USDC, amountIn);

        PathKey[] memory path = new PathKey[](2);
        path[0] = _pathKey(_v2AggPoolKey(address(USDC), address(WETH9)), Currency.wrap(address(WETH9)));
        path[1] = _pathKey(_v2AggPoolKey(address(WETH9), address(DAI)), Currency.wrap(address(DAI)));

        bytes memory plan =
            _planMultiHopExactIn(Currency.wrap(address(USDC)), Currency.wrap(address(DAI)), path, amountIn);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = plan;

        vm.prank(alice);
        vm.startSnapshotGas('v2_aggregator_twoHop_v2AggChain_exactIn');
        router.execute(commands, inputs, block.timestamp);
        vm.stopSnapshotGas();
    }

    function test_gas_threeHop_v2AggChain_exactIn() public onlyForked {
        uint128 amountIn = 1_000e6;
        _initializeV2AggPool(address(USDC), address(WETH9));
        _initializeV2AggPool(address(WETH9), address(DAI));
        _initializeV2AggPool(address(USDC), address(DAI));
        _fundAndApprove(alice, USDC, amountIn);

        PathKey[] memory path = new PathKey[](3);
        path[0] = _pathKey(_v2AggPoolKey(address(USDC), address(WETH9)), Currency.wrap(address(WETH9)));
        path[1] = _pathKey(_v2AggPoolKey(address(WETH9), address(DAI)), Currency.wrap(address(DAI)));
        path[2] = _pathKey(_v2AggPoolKey(address(USDC), address(DAI)), Currency.wrap(address(USDC)));

        bytes memory plan =
            _planMultiHopExactIn(Currency.wrap(address(USDC)), Currency.wrap(address(USDC)), path, amountIn);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = plan;

        vm.prank(alice);
        vm.startSnapshotGas('v2_aggregator_threeHop_v2AggChain_exactIn');
        router.execute(commands, inputs, block.timestamp);
        vm.stopSnapshotGas();
    }

    // --------------------------------------------------------------------- //
    // Plan-encoding helpers (local copies — keeps gas file self-contained)
    // --------------------------------------------------------------------- //

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
        uint128 amountIn,
        uint128 amountOut,
        Currency currencyIn,
        Currency currencyOut
    ) internal pure returns (bytes memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_OUT_SINGLE), uint8(Actions.TAKE_ALL)
        );
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

    function _planMultiHopExactIn(Currency currencyIn, Currency currencyOut, PathKey[] memory path, uint128 amountIn)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SETTLE), uint8(Actions.SWAP_EXACT_IN), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(currencyIn, uint256(amountIn), true);
        params[1] = abi.encode(
            IV4Router.ExactInputParams({
                currencyIn: currencyIn,
                path: path,
                minHopPriceX36: new uint256[](0),
                amountIn: amountIn,
                amountOutMinimum: 0
            })
        );
        params[2] = abi.encode(currencyOut, uint256(0));
        return abi.encode(actions, params);
    }

    function _pathKey(PoolKey memory hop, Currency outputCurrency) internal pure returns (PathKey memory) {
        return PathKey({
            intermediateCurrency: outputCurrency,
            fee: hop.fee,
            tickSpacing: hop.tickSpacing,
            hooks: hop.hooks,
            hookData: bytes('')
        });
    }
}
