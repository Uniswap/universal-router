// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {Deployers} from '@uniswap/v4-core/test/utils/Deployers.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IUnlockCallback} from '@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {MockERC20} from 'solmate/src/test/utils/mocks/MockERC20.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';

import {Plan, Planner} from '@uniswap/v4-periphery/test/shared/Planner.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {IV4Router} from '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';

contract Permit2AllowanceMock {
    struct Allowance {
        uint160 amount;
        uint48 expiration;
    }

    mapping(address owner => mapping(address token => mapping(address spender => Allowance))) internal allowances;

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        allowances[msg.sender][token][spender] = Allowance({amount: amount, expiration: expiration});
    }

    function allowance(address user, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce)
    {
        Allowance memory allowed = allowances[user][token][spender];
        return (allowed.amount, allowed.expiration, 0);
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage allowed = allowances[from][token][msg.sender];
        if (block.timestamp > allowed.expiration) revert IAllowanceTransfer.AllowanceExpired(allowed.expiration);
        if (allowed.amount != type(uint160).max) {
            if (amount > allowed.amount) revert IAllowanceTransfer.InsufficientAllowance(allowed.amount);
            allowed.amount -= amount;
        }
        MockERC20(token).transferFrom(from, to, amount);
    }
}

/// @notice Holds the v4 PoolManager lock and calls UniversalRouter.execute from inside the unlock callback,
///         simulating a contract (e.g. a swap-and-add zap) that composes a UR swap within its own unlock.
contract LockHolder is IUnlockCallback {
    IPoolManager public immutable manager;
    UniversalRouter public immutable router;

    bytes internal commands;
    bytes[] internal inputs;

    constructor(IPoolManager _manager, UniversalRouter _router) {
        manager = _manager;
        router = _router;
    }

    /// @dev unlocks the manager, then (in the callback) runs the UR command set within the existing lock
    function executeWithinUnlock(bytes calldata _commands, bytes[] calldata _inputs) external {
        commands = _commands;
        inputs = _inputs;
        manager.unlock(hex'');
    }

    /// @dev calls UR directly as a contract caller. This is the pre-existing non-nested composition shape.
    function executeDirect(bytes calldata _commands, bytes[] calldata _inputs) external {
        router.execute(_commands, _inputs);
    }

    function approvePermit2(address token, IAllowanceTransfer permit2, address spender) external {
        MockERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, spender, type(uint160).max, type(uint48).max);
    }

    /// @dev unlocks, then attempts a second (nested) unlock inside the callback -> AlreadyUnlocked
    function nestedUnlock() external {
        manager.unlock(hex'01');
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), 'only manager');
        if (data.length == 0) {
            router.execute(commands, inputs);
        } else {
            manager.unlock(hex'');
        }
        return hex'';
    }
}

contract V4SwapWithinUnlockTest is Test, Deployers {
    UniversalRouter router;
    LockHolder lockHolder;
    IAllowanceTransfer permit2;

    address constant RECIPIENT = address(0xBEEF);
    uint128 constant AMOUNT_IN = 1e18;

    function setUp() public {
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(0)), 3000, SQRT_PRICE_1_1);
        permit2 = IAllowanceTransfer(address(new Permit2AllowanceMock()));

        RouterParameters memory params = RouterParameters({
            permit2: address(permit2),
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
        lockHolder = new LockHolder(IPoolManager(address(manager)), router);
    }

    /// @dev builds a single V4_SWAP command: exact-in currency0 -> currency1, paying the input from the
    ///      router's own balance (payerIsUser = false) and sending the output to RECIPIENT.
    function _v4SwapCommand() internal view returns (bytes memory commands, bytes[] memory inputs) {
        return _v4SwapCommand(RECIPIENT, false);
    }

    function _v4SwapCommand(address recipient, bool payerIsUser)
        internal
        view
        returns (bytes memory commands, bytes[] memory inputs)
    {
        IV4Router.ExactInputSingleParams memory sp = IV4Router.ExactInputSingleParams({
            poolKey: key, zeroForOne: true, amountIn: AMOUNT_IN, amountOutMinimum: 0, minHopPriceX36: 0, hookData: hex''
        });

        Plan memory plan = Planner.init();
        plan = plan.add(Actions.SWAP_EXACT_IN_SINGLE, abi.encode(sp));
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, payerIsUser));
        plan = plan.add(Actions.TAKE, abi.encode(currency1, recipient, ActionConstants.OPEN_DELTA));

        commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        inputs = new bytes[](1);
        inputs[0] = plan.encode();
    }

    function _fundRouter() internal {
        MockERC20(Currency.unwrap(currency0)).transfer(address(router), AMOUNT_IN);
    }

    function _fundLockHolderAndApprovePermit2() internal {
        MockERC20(Currency.unwrap(currency0)).transfer(address(lockHolder), AMOUNT_IN);
        lockHolder.approvePermit2(Currency.unwrap(currency0), permit2, address(router));
    }

    /// @notice The new behavior: a V4_SWAP runs within an already-open lock via _executeActionsWithoutUnlock.
    function test_v4Swap_withinExistingUnlock_succeeds() public {
        _fundRouter();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand();

        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0);
        lockHolder.executeWithinUnlock(commands, inputs);
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0, 'swap did not execute in lock');
    }

    /// @notice Regression: top-level (manager not yet unlocked) still opens its own lock as before.
    function test_v4Swap_topLevel_stillWorks() public {
        _fundRouter();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand();

        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0);
        router.execute(commands, inputs);
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0, 'top-level swap failed');
    }

    /// @notice In nested execution, MSG_SENDER resolves to the lock-holder contract, not the EOA/test contract.
    function test_v4Swap_withinExistingUnlock_msgSenderRecipientIsLockHolder() public {
        _fundRouter();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand(ActionConstants.MSG_SENDER, false);

        uint256 lockHolderBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(lockHolder));
        uint256 testBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        lockHolder.executeWithinUnlock(commands, inputs);

        assertGt(
            MockERC20(Currency.unwrap(currency1)).balanceOf(address(lockHolder)),
            lockHolderBalanceBefore,
            'lock-holder did not receive'
        );
        assertEq(
            MockERC20(Currency.unwrap(currency1)).balanceOf(address(this)),
            testBalanceBefore,
            'EOA/test received output'
        );
    }

    /// @notice Direct contract-mediated UR calls had the same MSG_SENDER semantics before this branch.
    function test_v4Swap_topLevelContractCaller_msgSenderRecipientIsLockHolder() public {
        _fundRouter();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand(ActionConstants.MSG_SENDER, false);

        uint256 lockHolderBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(lockHolder));
        uint256 testBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        lockHolder.executeDirect(commands, inputs);

        assertGt(
            MockERC20(Currency.unwrap(currency1)).balanceOf(address(lockHolder)),
            lockHolderBalanceBefore,
            'lock-holder did not receive'
        );
        assertEq(
            MockERC20(Currency.unwrap(currency1)).balanceOf(address(this)),
            testBalanceBefore,
            'EOA/test received output'
        );
    }

    /// @notice In nested execution, payerIsUser pulls from the lock-holder through Permit2.
    function test_v4Swap_withinExistingUnlock_payerIsUserPullsFromLockHolder() public {
        _fundLockHolderAndApprovePermit2();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand(RECIPIENT, true);

        uint256 lockHolderBalanceBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(lockHolder));
        uint256 recipientBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT);
        lockHolder.executeWithinUnlock(commands, inputs);

        assertLt(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(lockHolder)),
            lockHolderBalanceBefore,
            'lock-holder did not pay'
        );
        assertGt(
            MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT),
            recipientBalanceBefore,
            'recipient did not receive output'
        );
    }

    /// @notice Direct contract-mediated UR calls had the same payerIsUser semantics before this branch.
    function test_v4Swap_topLevelContractCaller_payerIsUserPullsFromLockHolder() public {
        _fundLockHolderAndApprovePermit2();
        (bytes memory commands, bytes[] memory inputs) = _v4SwapCommand(RECIPIENT, true);

        uint256 lockHolderBalanceBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(lockHolder));
        uint256 recipientBalanceBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT);
        lockHolder.executeDirect(commands, inputs);

        assertLt(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(lockHolder)),
            lockHolderBalanceBefore,
            'lock-holder did not pay'
        );
        assertGt(
            MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT),
            recipientBalanceBefore,
            'recipient did not receive output'
        );
    }

    /// @notice Documents the constraint the branch works around: a raw nested unlock reverts.
    function test_rawNestedUnlock_reverts() public {
        vm.expectRevert();
        lockHolder.nestedUnlock();
    }
}
