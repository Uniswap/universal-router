// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {MockV3FeeAdapter, RevertingV3FeeAdapter, MockV3Factory} from './mock/MockV3FeeAdapter.sol';

/// @notice Exercises V3_PROTOCOL_FEE_UPDATE end to end: the router reads the v3 factory owner (the fee adapter)
/// and pokes it for the given pool.
contract V3ProtocolFeeUpdateTest is Test {
    address constant POOL = address(0xBEEF);

    UniversalRouter router;
    MockV3Factory factory;
    MockV3FeeAdapter adapter;

    function setUp() public {
        factory = new MockV3Factory();
        adapter = new MockV3FeeAdapter();
        factory.setOwner(address(adapter));

        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(factory),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
    }

    function _plan(address pool, bool allowRevert)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        uint8 command = uint8(Commands.V3_PROTOCOL_FEE_UPDATE);
        if (allowRevert) command |= uint8(Commands.FLAG_ALLOW_REVERT);
        commands = abi.encodePacked(bytes1(command));
        inputs = new bytes[](1);
        inputs[0] = abi.encode(pool);
    }

    function test_v3ProtocolFeeUpdate_pokesFactoryOwnerForPool() public {
        (bytes memory commands, bytes[] memory inputs) = _plan(POOL, false);
        router.execute(commands, inputs);

        assertEq(adapter.calls(), 1);
        assertEq(adapter.lastPool(), POOL);
        assertEq(adapter.lastCaller(), address(router));
    }

    function test_v3ProtocolFeeUpdate_revertBubblesWhenRequired() public {
        factory.setOwner(address(new RevertingV3FeeAdapter()));
        (bytes memory commands, bytes[] memory inputs) = _plan(POOL, false);

        vm.expectRevert(
            abi.encodeWithSelector(
                IUniversalRouter.ExecutionFailed.selector,
                uint256(0),
                abi.encodeWithSelector(RevertingV3FeeAdapter.PokeRejected.selector)
            )
        );
        router.execute(commands, inputs);
    }

    function test_v3ProtocolFeeUpdate_allowRevertContinues() public {
        factory.setOwner(address(new RevertingV3FeeAdapter()));
        (bytes memory commands, bytes[] memory inputs) = _plan(POOL, true);
        router.execute(commands, inputs);
    }

    /// @dev With no adapter set as factory owner the poke targets address(0) and is a no-op rather than a
    /// route failure, so a route built for every chain does not need a per-chain command set.
    function test_v3ProtocolFeeUpdate_noOwnerIsNoop() public {
        factory.setOwner(address(0));
        (bytes memory commands, bytes[] memory inputs) = _plan(POOL, false);
        router.execute(commands, inputs);
    }

    function test_v3ProtocolFeeUpdate_shortInputReverts() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V3_PROTOCOL_FEE_UPDATE)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = bytes('');

        vm.expectRevert(CalldataDecoder.SliceOutOfBounds.selector);
        router.execute(commands, inputs);
    }
}
