// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {Deployers} from '@uniswap/v4-core/test/utils/Deployers.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {StateLibrary} from '@uniswap/v4-core/src/libraries/StateLibrary.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {MockV4FeeAdapter, RevertingV4FeeAdapter} from './mock/MockV4FeeAdapter.sol';

/// @notice Exercises V4_PROTOCOL_FEE_UPDATE end to end: the router reads the PoolManager's registered
/// protocolFeeController and pokes it for the given pool, which pushes the adapter's fee into pool state.
contract V4ProtocolFeeUpdateTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint24 constant PROTOCOL_FEE = 1000 | (1000 << 12); // 0.1% each direction, in PoolManager encoding

    UniversalRouter router;
    MockV4FeeAdapter adapter;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        (key,) = initPool(currency0, currency1, IHooks(address(0)), 3000, SQRT_PRICE_1_1);

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

        adapter = new MockV4FeeAdapter(manager, PROTOCOL_FEE);
        manager.setProtocolFeeController(address(adapter));
    }

    function _plan(PoolKey memory poolKey, bool allowRevert)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        uint8 command = uint8(Commands.V4_PROTOCOL_FEE_UPDATE);
        if (allowRevert) command |= uint8(Commands.FLAG_ALLOW_REVERT);
        commands = abi.encodePacked(bytes1(command));
        inputs = new bytes[](1);
        inputs[0] = abi.encode(poolKey);
    }

    function test_v4ProtocolFeeUpdate_pokesRegisteredControllerAndSetsFee() public {
        (,, uint24 feeBefore,) = manager.getSlot0(key.toId());
        assertEq(feeBefore, 0);

        (bytes memory commands, bytes[] memory inputs) = _plan(key, false);
        router.execute(commands, inputs);

        assertEq(adapter.calls(), 1);
        assertEq(PoolId.unwrap(adapter.lastPoolId()), PoolId.unwrap(key.toId()));
        assertEq(adapter.lastCaller(), address(router));
        (,, uint24 feeAfter,) = manager.getSlot0(key.toId());
        assertEq(feeAfter, PROTOCOL_FEE);
    }

    function test_v4ProtocolFeeUpdate_idempotentRepoke() public {
        (bytes memory commands, bytes[] memory inputs) = _plan(key, false);
        router.execute(commands, inputs);
        router.execute(commands, inputs);
        assertEq(adapter.calls(), 2);
        (,, uint24 fee,) = manager.getSlot0(key.toId());
        assertEq(fee, PROTOCOL_FEE);
    }

    function test_v4ProtocolFeeUpdate_revertBubblesWhenRequired() public {
        RevertingV4FeeAdapter reverting = new RevertingV4FeeAdapter();
        manager.setProtocolFeeController(address(reverting));

        (bytes memory commands, bytes[] memory inputs) = _plan(key, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                IUniversalRouter.ExecutionFailed.selector,
                uint256(0),
                abi.encodeWithSelector(RevertingV4FeeAdapter.PokeRejected.selector)
            )
        );
        router.execute(commands, inputs);
    }

    function test_v4ProtocolFeeUpdate_allowRevertContinues() public {
        RevertingV4FeeAdapter reverting = new RevertingV4FeeAdapter();
        manager.setProtocolFeeController(address(reverting));

        (bytes memory commands, bytes[] memory inputs) = _plan(key, true);
        router.execute(commands, inputs);
        (,, uint24 fee,) = manager.getSlot0(key.toId());
        assertEq(fee, 0);
    }

    /// @dev On a chain with no controller registered the poke has nowhere to go and is a no-op rather than a
    /// route failure, so routes built for every chain do not need per-chain command sets.
    function test_v4ProtocolFeeUpdate_noControllerIsNoop() public {
        manager.setProtocolFeeController(address(0));

        (bytes memory commands, bytes[] memory inputs) = _plan(key, false);
        router.execute(commands, inputs);
        (,, uint24 fee,) = manager.getSlot0(key.toId());
        assertEq(fee, 0);
    }

    function test_v4ProtocolFeeUpdate_shortInputReverts() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_PROTOCOL_FEE_UPDATE)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing); // one word short

        vm.expectRevert(CalldataDecoder.SliceOutOfBounds.selector);
        router.execute(commands, inputs);
    }
}
