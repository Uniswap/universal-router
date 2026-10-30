// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {Deployers} from '@uniswap/v4-core/test/utils/Deployers.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IUnlockCallback} from '@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {MockERC20} from 'solmate/src/test/utils/mocks/MockERC20.sol';

import {Plan, Planner} from '@uniswap/v4-periphery/test/shared/Planner.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IPositionManager} from '@uniswap/v4-periphery/src/interfaces/IPositionManager.sol';
import {ERC721} from 'solmate/src/tokens/ERC721.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Dispatcher} from '../../contracts/base/Dispatcher.sol';

/// @notice Opens the PoolManager lock and runs a router plan from inside the callback, the shape of a contract
/// that composes router commands within its own unlock.
contract PositionManagerLockHolder is IUnlockCallback {
    IPoolManager public immutable manager;
    UniversalRouter public immutable router;

    bytes internal commands;
    bytes[] internal inputs;

    constructor(IPoolManager _manager, UniversalRouter _router) {
        manager = _manager;
        router = _router;
    }

    function executeWithinUnlock(bytes calldata _commands, bytes[] calldata _inputs) external {
        commands = _commands;
        inputs = _inputs;
        manager.unlock(hex'');
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(manager), 'only manager');
        router.executeNested(commands, inputs, block.timestamp);
        return hex'';
    }
}

/// @notice V4_POSITION_MANAGER_CALL may only reach modifyLiquidities, which opens its own PoolManager unlock, so
/// inside a foreign unlock the call can only fail with AlreadyUnlocked. The router refuses it up front instead,
/// so FLAG_ALLOW_REVERT cannot turn that failure into a silent skip that strands the funds the route parked in
/// the position manager.
contract V4PositionManagerCallWithinUnlockTest is Test, Deployers {
    address constant USER = address(0xA11CE);
    uint256 constant FUNDING = 1e18;
    uint256 constant LIQUIDITY = 1e18;
    int24 constant TICK_LOWER = -600;
    int24 constant TICK_UPPER = 600;

    UniversalRouter router;
    IPositionManager posm;
    PositionManagerLockHolder lockHolder;

    function setUp() public {
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(0)), 3000, SQRT_PRICE_1_1);

        posm = _deployPositionManager();

        router = new UniversalRouter(
            RouterParameters({
                permit2: address(0),
                weth9: address(0),
                v2Factory: address(0),
                v3Factory: address(0),
                pairInitCodeHash: bytes32(0),
                poolInitCodeHash: bytes32(0),
                v4PoolManager: address(manager),
                permissionsAdapterFactory: address(0),
                v3NFTPositionManager: address(0),
                v4PositionManager: address(posm),
                spokePool: address(0)
            })
        );
        lockHolder = new PositionManagerLockHolder(IPoolManager(address(manager)), router);

        // the route pays the mint from the position manager's own balance, the shape the v3 to v4 migration uses
        MockERC20(Currency.unwrap(currency0)).transfer(address(posm), FUNDING);
        MockERC20(Currency.unwrap(currency1)).transfer(address(posm), FUNDING);
    }

    /// @dev PositionManager.sol is pinned to its own optimizer profile in foundry.toml, which cannot share a
    /// compilation job with UniversalRouter.sol, so the test deploys it from the compiled artifact instead of
    /// importing it. The permit2, descriptor and WETH9 arguments are unused by a mint paid from its own balance.
    function _deployPositionManager() internal returns (IPositionManager deployed) {
        bytes memory initcode = abi.encodePacked(
            vm.getCode('PositionManager.sol:PositionManager'),
            abi.encode(address(manager), address(0), uint256(100_000), address(0), address(0))
        );
        address addr;
        assembly ('memory-safe') {
            addr := create(0, add(initcode, 0x20), mload(initcode))
        }
        require(addr != address(0), 'position manager deploy failed');
        deployed = IPositionManager(addr);
    }

    /// @dev a mint paid from the position manager's balance, sweeping whatever the mint did not use back to USER
    function _mintCommand(bool allowRevert) internal view returns (bytes memory commands, bytes[] memory inputs) {
        Plan memory plan = Planner.init();
        plan = plan.add(
            Actions.MINT_POSITION,
            abi.encode(key, TICK_LOWER, TICK_UPPER, LIQUIDITY, type(uint128).max, type(uint128).max, USER, new bytes(0))
        );
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.SETTLE, abi.encode(currency1, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.SWEEP, abi.encode(currency0, USER));
        plan = plan.add(Actions.SWEEP, abi.encode(currency1, USER));

        bytes1 command = bytes1(uint8(Commands.V4_POSITION_MANAGER_CALL));
        if (allowRevert) command |= Commands.FLAG_ALLOW_REVERT;
        commands = abi.encodePacked(command);
        inputs = new bytes[](1);
        inputs[0] = abi.encodeCall(IPositionManager.modifyLiquidities, (plan.encode(), block.timestamp));
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

    /// @notice control: the same calldata mints at the top level, so below it is only the gate that intervenes
    function test_v4PositionManagerCall_topLevel_mints() public {
        (bytes memory commands, bytes[] memory inputs) = _mintCommand(false);
        router.execute(commands, inputs);

        assertEq(ERC721(address(posm)).ownerOf(1), USER);
        assertEq(MockERC20(Currency.unwrap(currency0)).balanceOf(address(posm)), 0, 'currency0 swept');
        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(address(posm)), 0, 'currency1 swept');
    }

    function test_v4PositionManagerCall_withinForeignUnlock_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _mintCommand(false);
        vm.expectRevert(Dispatcher.NestedExecutionNotPermitted.selector);
        lockHolder.executeWithinUnlock(commands, inputs);
    }

    /// @notice the gate fires in the router's own frame, so the flag that tolerates call failures cannot skip it
    function test_v4PositionManagerCall_withinForeignUnlock_allowRevertCannotSkip() public {
        (bytes memory commands, bytes[] memory inputs) = _mintCommand(true);
        vm.expectRevert(Dispatcher.NestedExecutionNotPermitted.selector);
        lockHolder.executeWithinUnlock(commands, inputs);
    }

    /// @notice an allow-revert sub-plan re-throws the gate error instead of swallowing it
    function test_v4PositionManagerCall_withinForeignUnlock_allowRevertSubPlanCannotSkip() public {
        (bytes memory sub, bytes[] memory subInputs) = _mintCommand(false);
        (bytes memory commands, bytes[] memory inputs) = _subPlan(sub, subInputs, true);
        vm.expectRevert(Dispatcher.NestedExecutionNotPermitted.selector);
        lockHolder.executeWithinUnlock(commands, inputs);
    }
}
