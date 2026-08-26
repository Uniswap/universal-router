// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorBase} from '../../_AggregatorBase.t.sol';
import {V2AggregatorHandler} from './V2AggregatorHandler.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

/// @title V2AggregatorInvariant
/// @notice Stateful-fuzz invariant checks for V4_SWAP-against-V2AggHook. Each handler action
///         performs a random swap; invariants below run after every action.
///
/// @dev Invariants asserted:
///   1. V2 pair's K never decreases (V2 mechanics + 0.3% fee strictly grows K).
///   2. Router holds zero residual ERC20 balance after every action (deltas net to zero).
///   3. PoolManager holds zero net deltas (already enforced by v4-core unlock).
contract V2AggregatorInvariant is AggregatorBase {
    V2AggregatorHandler internal handler;

    function setUp() public override {
        super.setUp();
        if (!forked) return;

        (PoolKey memory v2AggKey_WETH_APE,) = _initializeV2AggPool(address(WETH9), address(APE));
        handler = new V2AggregatorHandler(router, PERMIT2, V2_FACTORY, v2AggKey_WETH_APE, WETH9, APE, alice);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = handler.action_swapWethForApeExactIn.selector;
        selectors[1] = handler.action_swapApeForWethExactIn.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev V2 pair K is non-decreasing after every action (constant product + 0.3% fee).
    function invariant_v2PairKNonDecreasing() public onlyForked {
        if (handler.callsExecuted() == 0) return;
        uint256 currentK = _readPairK();
        assertGe(currentK, handler.lastK(), 'V2 pair K decreased');
    }

    /// @dev Router never accumulates residual ERC20 balance — every unlock closes deltas to zero.
    function invariant_routerHoldsNoResidualTokens() public view onlyForked {
        assertEq(WETH9.balanceOf(address(router)), 0, 'router holds WETH');
        assertEq(APE.balanceOf(address(router)), 0, 'router holds APE');
        assertEq(USDC.balanceOf(address(router)), 0, 'router holds USDC');
        assertEq(DAI.balanceOf(address(router)), 0, 'router holds DAI');
    }

    /// @dev Aggregator hook never accumulates residual ERC20 balance either — its deltas net to zero.
    function invariant_aggregatorHoldsNoResidualTokens() public view onlyForked {
        assertEq(WETH9.balanceOf(address(aggregatorHook)), 0, 'hook holds WETH');
        assertEq(APE.balanceOf(address(aggregatorHook)), 0, 'hook holds APE');
    }

    function _readPairK() internal view returns (uint256) {
        address pair = V2_FACTORY.getPair(address(WETH9), address(APE));
        (uint112 r0, uint112 r1,) = __pairReserves(pair);
        return uint256(r0) * uint256(r1);
    }

    function __pairReserves(address pair) private view returns (uint112, uint112, uint32) {
        (bool ok, bytes memory data) = pair.staticcall(abi.encodeWithSignature('getReserves()'));
        require(ok, 'pair getReserves failed');
        return abi.decode(data, (uint112, uint112, uint32));
    }
}
