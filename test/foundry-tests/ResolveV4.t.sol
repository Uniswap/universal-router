// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {Deployers} from '@uniswap/v4-core/test/utils/Deployers.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {SafeCast} from '@uniswap/v4-core/src/libraries/SafeCast.sol';
import {MockERC20} from 'solmate/src/test/utils/mocks/MockERC20.sol';

import {Plan, Planner} from '@uniswap/v4-periphery/test/shared/Planner.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {MockResolver} from './mock/MockResolver.sol';

/// @notice The motivating RESOLVE flow: a v4 exact-output swap whose amountOut is only known onchain (a live
/// debt, say) is resolved by a prior RESOLVE command and consumed through the USE_RESOLVED_AMOUNT sentinel.
contract ResolveV4Test is Test, Deployers {
    using Planner for Plan;

    address constant RECIPIENT = address(0xBEEF);
    uint128 constant FUNDING = 100 ether;
    // Deployers seeds the pool with 1e18 liquidity across ticks -120..120, so keep swaps well inside that depth.
    uint128 constant DEBT = 0.001 ether;
    uint128 constant SELL_AMOUNT = 0.001 ether;
    uint128 constant LITERAL = 0.0005 ether;

    UniversalRouter router;

    function setUp() public {
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(0)), 3000, SQRT_PRICE_1_1);

        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(manager),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);

        // The router pays the swap input from its own balance (payerIsUser = false), so no Permit2 is needed.
        MockERC20(Currency.unwrap(currency0)).transfer(address(router), FUNDING);
    }

    function _exactOutPlan(uint128 amountOut) internal view returns (bytes memory) {
        IV4Router.ExactOutputSingleParams memory sp = IV4Router.ExactOutputSingleParams({
            poolKey: key,
            zeroForOne: true,
            amountOut: amountOut,
            amountInMaximum: type(uint128).max,
            minHopPriceX36: 0,
            hookData: hex''
        });
        Plan memory plan = Planner.init();
        plan = plan.add(Actions.SWAP_EXACT_OUT_SINGLE, abi.encode(sp));
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.TAKE, abi.encode(currency1, RECIPIENT, ActionConstants.OPEN_DELTA));
        return plan.encode();
    }

    function _exactInPlan(uint128 amountIn) internal view returns (bytes memory) {
        IV4Router.ExactInputSingleParams memory sp = IV4Router.ExactInputSingleParams({
            poolKey: key, zeroForOne: true, amountIn: amountIn, amountOutMinimum: 0, minHopPriceX36: 0, hookData: hex''
        });
        Plan memory plan = Planner.init();
        plan = plan.add(Actions.SWAP_EXACT_IN_SINGLE, abi.encode(sp));
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.TAKE, abi.encode(currency1, RECIPIENT, ActionConstants.OPEN_DELTA));
        return plan.encode();
    }

    function _resolveThenV4(address resolver, bytes memory v4Plan)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)), bytes1(uint8(Commands.V4_SWAP)));
        inputs = new bytes[](2);
        inputs[0] = abi.encode(resolver, bytes(''));
        inputs[1] = v4Plan;
    }

    function test_resolve_v4ExactOut_swapsExactlyTheResolvedAmount() public {
        MockResolver resolver = new MockResolver(DEBT);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenV4(address(resolver), _exactOutPlan(uint128(Constants.USE_RESOLVED_AMOUNT)));

        router.execute(commands, inputs);

        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), DEBT, 'output is the resolved amount');
        assertLt(MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)), FUNDING, 'input was paid');
    }

    function test_resolve_v4ExactIn_swapsExactlyTheResolvedAmount() public {
        MockResolver resolver = new MockResolver(SELL_AMOUNT);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenV4(address(resolver), _exactInPlan(uint128(Constants.USE_RESOLVED_AMOUNT)));

        router.execute(commands, inputs);

        assertEq(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)),
            FUNDING - SELL_AMOUNT,
            'exactly the resolved input was spent'
        );
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0);
    }

    function test_resolve_v4LiteralAmountUnaffected() public {
        MockResolver resolver = new MockResolver(DEBT);
        (bytes memory commands, bytes[] memory inputs) = _resolveThenV4(address(resolver), _exactOutPlan(LITERAL));

        router.execute(commands, inputs);

        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), LITERAL);
    }

    /// @dev v4 amounts are uint128; a register value that does not fit must revert rather than truncate. The v4
    /// actions run inside the PoolManager unlock via a direct internal call, so the revert surfaces unwrapped.
    function test_resolve_v4RegisterTooLargeReverts() public {
        MockResolver resolver = new MockResolver(uint256(type(uint128).max) + 1);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenV4(address(resolver), _exactOutPlan(uint128(Constants.USE_RESOLVED_AMOUNT)));

        vm.expectRevert(SafeCast.SafeCastOverflow.selector);
        router.execute(commands, inputs);
    }

    /// @dev Without a RESOLVE the register is zero, which the v4 helpers read as OPEN_DELTA: with no open delta the
    /// exact-output swap requests zero output and the route ends up moving nothing.
    function test_resolve_v4SentinelWithoutResolveReadsZeroRegister() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = _exactOutPlan(uint128(Constants.USE_RESOLVED_AMOUNT));

        vm.expectRevert();
        router.execute(commands, inputs);
    }
}
