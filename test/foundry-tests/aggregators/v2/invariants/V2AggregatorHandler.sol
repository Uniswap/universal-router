// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {UniversalRouter} from '../../../../../contracts/UniversalRouter.sol';
import {Commands} from '../../../../../contracts/libraries/Commands.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/// @title V2AggregatorHandler
/// @notice Stateful-fuzz handler that performs randomized V4_SWAP-against-V2AggHook swaps.
///         The companion `V2AggregatorInvariant` contract reads handler state + on-chain
///         observables (router residuals, V2 pair K) to check protocol invariants.
contract V2AggregatorHandler is Test {
    UniversalRouter public immutable router;
    IPermit2 public immutable permit2;
    IUniswapV2Factory public immutable v2Factory;
    PoolKey public v2AggKey_WETH_APE;
    ERC20 public immutable weth;
    ERC20 public immutable ape;
    address public immutable pair;

    address public alice;
    uint256 public callsExecuted;
    uint256 public lastK;

    constructor(
        UniversalRouter _router,
        IPermit2 _permit2,
        IUniswapV2Factory _v2Factory,
        PoolKey memory _v2AggKey_WETH_APE,
        ERC20 _weth,
        ERC20 _ape,
        address _alice
    ) {
        router = _router;
        permit2 = _permit2;
        v2Factory = _v2Factory;
        v2AggKey_WETH_APE = _v2AggKey_WETH_APE;
        weth = _weth;
        ape = _ape;
        alice = _alice;
        pair = _v2Factory.getPair(address(_weth), address(_ape));
        lastK = _readK();
    }

    /// @notice Randomized exact-in WETH → APE swap.
    function action_swapWethForApeExactIn(uint128 amountIn) external {
        amountIn = uint128(bound(amountIn, 0.0001 ether, 5 ether));
        deal(address(weth), alice, weth.balanceOf(alice) + amountIn);
        _approveOnce();

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactIn(
            v2AggKey_WETH_APE,
            address(weth) < address(ape), // zeroForOne true if WETH is c0
            amountIn,
            Currency.wrap(address(weth)),
            Currency.wrap(address(ape))
        );

        uint256 kBefore = _readK();
        vm.prank(alice);
        try router.execute(commands, inputs, block.timestamp) {
            uint256 kAfter = _readK();
            require(kAfter >= kBefore, 'K decreased');
            lastK = kAfter;
            callsExecuted++;
        } catch {
            // Allow random reverts (e.g. amountIn too large for reserves at this fork point).
        }
    }

    /// @notice Randomized exact-in APE → WETH swap.
    function action_swapApeForWethExactIn(uint128 amountIn) external {
        amountIn = uint128(bound(amountIn, 1 ether, 1_000 ether));
        deal(address(ape), alice, ape.balanceOf(alice) + amountIn);
        _approveOnce();

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _planExactIn(
            v2AggKey_WETH_APE,
            address(ape) < address(weth),
            amountIn,
            Currency.wrap(address(ape)),
            Currency.wrap(address(weth))
        );

        uint256 kBefore = _readK();
        vm.prank(alice);
        try router.execute(commands, inputs, block.timestamp) {
            uint256 kAfter = _readK();
            require(kAfter >= kBefore, 'K decreased');
            lastK = kAfter;
            callsExecuted++;
        } catch {
            // Allow random reverts.
        }
    }

    function _readK() internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pair).getReserves();
        return uint256(r0) * uint256(r1);
    }

    function _approveOnce() internal {
        if (weth.allowance(alice, address(permit2)) == 0) {
            vm.startPrank(alice);
            weth.approve(address(permit2), type(uint256).max);
            ape.approve(address(permit2), type(uint256).max);
            permit2.approve(address(weth), address(router), type(uint160).max, type(uint48).max);
            permit2.approve(address(ape), address(router), type(uint160).max, type(uint48).max);
            vm.stopPrank();
        }
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
}
