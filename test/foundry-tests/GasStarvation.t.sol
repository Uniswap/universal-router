// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Dispatcher} from '../../contracts/base/Dispatcher.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {GasBurningResolver, RevertingResolver} from './mock/MockResolver.sol';

/// @notice A command built on an external call fails with no returndata when its callee runs out of gas, which
/// FLAG_ALLOW_REVERT would tolerate like any other failure even though the gas limit is the submitter's choice.
/// The router treats a failure that leaves it at the EIP-150 floor (under 1/64 of what the command started with)
/// as fatal, at the top level and through any allow-revert sub-plan boundary.
contract GasStarvationTest is Test {
    /// @dev plenty for the plan's own work, so only the burner can exhaust it
    uint256 constant GAS_LIMIT = 1_000_000;

    UniversalRouter router;
    GasBurningResolver burner;
    RevertingResolver reverter;

    function setUp() public {
        router = new UniversalRouter(
            RouterParameters({
                permit2: address(0),
                weth9: address(0),
                v2Factory: address(0),
                v3Factory: address(0),
                pairInitCodeHash: bytes32(0),
                poolInitCodeHash: bytes32(0),
                v4PoolManager: address(0),
                permissionsAdapterFactory: address(0),
                v3NFTPositionManager: address(0),
                v4PositionManager: address(0),
                spokePool: address(0)
            })
        );
        burner = new GasBurningResolver();
        reverter = new RevertingResolver();
    }

    function _resolve(address resolver, bool allowRevert)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        bytes1 command = bytes1(uint8(Commands.RESOLVE));
        if (allowRevert) command |= Commands.FLAG_ALLOW_REVERT;
        commands = abi.encodePacked(command);
        inputs = new bytes[](1);
        inputs[0] = abi.encode(resolver, bytes(''));
    }

    function _subPlan(bytes memory sub, bytes[] memory subInputs, bool allowRevert)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        bytes1 command = bytes1(uint8(Commands.EXECUTE_SUB_PLAN));
        if (allowRevert) command |= Commands.FLAG_ALLOW_REVERT;
        commands = abi.encodePacked(command);
        inputs = new bytes[](1);
        inputs[0] = abi.encode(sub, subInputs);
    }

    function test_starvedAllowRevertCommand_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _resolve(address(burner), true);
        vm.expectRevert(Dispatcher.InsufficientGas.selector);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }

    function test_starvedRequiredCommand_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _resolve(address(burner), false);
        vm.expectRevert(Dispatcher.InsufficientGas.selector);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }

    /// @notice the starvation check runs before the required-command check, so the inner frame reports
    /// InsufficientGas rather than an ExecutionFailed the allow-revert parent would swallow
    function test_starvedRequiredCommandInAllowRevertSubPlan_reverts() public {
        (bytes memory sub, bytes[] memory subInputs) = _resolve(address(burner), false);
        (bytes memory commands, bytes[] memory inputs) = _subPlan(sub, subInputs, true);
        vm.expectRevert(Dispatcher.InsufficientGas.selector);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }

    function test_starvedAllowRevertCommandInAllowRevertSubPlan_reverts() public {
        (bytes memory sub, bytes[] memory subInputs) = _resolve(address(burner), true);
        (bytes memory commands, bytes[] memory inputs) = _subPlan(sub, subInputs, true);
        vm.expectRevert(Dispatcher.InsufficientGas.selector);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }

    /// @notice control: an ordinary failure under the flag is still tolerated
    function test_ordinaryFailure_allowRevert_isTolerated() public {
        (bytes memory commands, bytes[] memory inputs) = _resolve(address(reverter), true);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }

    /// @notice control: an ordinary failure without the flag still surfaces as ExecutionFailed
    function test_ordinaryFailure_required_isExecutionFailed() public {
        (bytes memory commands, bytes[] memory inputs) = _resolve(address(reverter), false);
        vm.expectPartialRevert(IUniversalRouter.ExecutionFailed.selector);
        router.execute{gas: GAS_LIMIT}(commands, inputs);
    }
}
