// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../../contracts/UniversalRouter.sol';
import {Payments} from '../../../contracts/modules/Payments.sol';
import {Commands} from '../../../contracts/libraries/Commands.sol';
import {Constants} from '../../../contracts/libraries/Constants.sol';
import {RouterParameters} from '../../../contracts/types/RouterParameters.sol';
import {MockERC20} from '../mock/MockERC20.sol';

/// @notice Resolves exactly one address to a fixed underlying, and zero for everything else.
/// @dev The adapter address is never called, so it does not need to be a contract. Deliberately resolves
///      address(0) to a non-zero sentinel: a real factory returns zero there, but relying on that would make
///      ETH sweeps depend on a foreign contract's behaviour, so the dispatcher short-circuits ETH instead.
///      Any regression in that short-circuit surfaces as a failing ETH sweep here.
contract MockPermissionsAdapterFactory {
    address public immutable adapter;
    address public immutable underlying;
    address public constant ZERO_RESOLVES_TO = address(0xBADE7);

    constructor(address _adapter, address _underlying) {
        adapter = _adapter;
        underlying = _underlying;
    }

    function verifiedPermissionsAdapterOf(address token) external view returns (address) {
        if (token == address(0)) return ZERO_RESOLVES_TO;
        return token == adapter ? underlying : address(0);
    }
}

/// @notice Covers Dispatcher's SWEEP adapter-resolution branch, which is unreachable in the rest of the
///         suite because every other fixture deploys the router with the factory unset.
contract PermissionedSweepTest is Test {
    address constant RECIPIENT = address(1234);
    address constant ADAPTER = address(0xADA9741E4);
    uint256 constant AMOUNT = 10 ** 18;

    UniversalRouter router;
    MockERC20 underlying;
    MockERC20 ordinary;

    function setUp() public {
        underlying = new MockERC20();
        ordinary = new MockERC20();
        RouterParameters memory params;
        params.permissionsAdapterFactory = address(new MockPermissionsAdapterFactory(ADAPTER, address(underlying)));
        router = new UniversalRouter(params);
    }

    function _sweep(address token, uint256 amountMin) internal {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.SWEEP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(token, RECIPIENT, amountMin);
        router.execute(commands, inputs);
    }

    /// @dev Sweeping the adapter must deliver the underlying the router actually holds. Without the
    ///      substitution this reads balanceOf(ADAPTER) == 0 and silently transfers nothing.
    function test_sweep_adapterDeliversUnderlying() public {
        underlying.mint(address(router), AMOUNT);

        _sweep(ADAPTER, AMOUNT);

        assertEq(underlying.balanceOf(RECIPIENT), AMOUNT);
        assertEq(underlying.balanceOf(address(router)), 0);
    }

    /// @dev amountMinimum is enforced against the underlying balance, not the adapter's zero balance.
    function test_sweep_adapterRevertsBelowAmountMinimum() public {
        underlying.mint(address(router), AMOUNT);

        vm.expectRevert(Payments.InsufficientToken.selector);
        _sweep(ADAPTER, AMOUNT + 1);
    }

    /// @dev Negative case: a token the factory does not resolve is swept as itself, unchanged.
    function test_sweep_nonAdapterTokenUnaffected() public {
        ordinary.mint(address(router), AMOUNT);

        _sweep(address(ordinary), AMOUNT);

        assertEq(ordinary.balanceOf(RECIPIENT), AMOUNT);
    }

    /// @dev ETH sweeps must work with a live factory. Constants.ETH is address(0), which the resolution
    ///      short-circuits before ever reaching the factory.
    function test_sweep_ethWithLiveFactory() public {
        vm.deal(address(router), AMOUNT);

        _sweep(Constants.ETH, AMOUNT);

        assertEq(RECIPIENT.balance, AMOUNT);
        assertEq(address(router).balance, 0);
    }
}
