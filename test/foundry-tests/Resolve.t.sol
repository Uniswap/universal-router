// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {ResolvedAmount} from '../../contracts/libraries/ResolvedAmount.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockResolver, RevertingResolver, ShortReturnResolver, BombResolver} from './mock/MockResolver.sol';
import {DeployPermit2} from 'permit2/test/utils/DeployPermit2.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {Permit2Payments} from '../../contracts/modules/Permit2Payments.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';

/// @notice Exercises the RESOLVE command and the USE_RESOLVED_AMOUNT sentinel end-to-end through the
/// TRANSFER command, which resolves its value field from the register a prior RESOLVE populates.
contract ResolveTest is Test {
    address constant RECIPIENT = address(1234);
    uint256 constant N = 7_777 ether;

    UniversalRouter router;
    MockERC20 erc20;

    function setUp() public {
        RouterParameters memory params = RouterParameters({
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
        });
        router = new UniversalRouter(params);
        erc20 = new MockERC20();
    }

    function _resolveThenTransfer(address resolver, uint256 transferAmount)
        internal
        view
        returns (bytes memory commands, bytes[] memory inputs)
    {
        commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)), bytes1(uint8(Commands.TRANSFER)));
        inputs = new bytes[](2);
        inputs[0] = abi.encode(resolver, bytes(''));
        inputs[1] = abi.encode(address(erc20), RECIPIENT, transferAmount);
    }

    function test_resolve_transfersResolvedAmount() public {
        MockResolver resolver = new MockResolver(N);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenTransfer(address(resolver), Constants.USE_RESOLVED_AMOUNT);

        erc20.mint(address(router), N);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), N);
    }

    function test_resolve_literalAmountUnaffected() public {
        MockResolver resolver = new MockResolver(N);
        // The TRANSFER carries a literal amount, not the sentinel, so the register is ignored.
        (bytes memory commands, bytes[] memory inputs) = _resolveThenTransfer(address(resolver), 1 ether);

        erc20.mint(address(router), N);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), 1 ether);
    }

    function test_resolve_revertingResolver_bubblesWhenRequired() public {
        RevertingResolver resolver = new RevertingResolver();
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(resolver), bytes(''));

        vm.expectRevert(abi.encodeWithSelector(IUniversalRouter.ExecutionFailed.selector, uint256(0), bytes('')));
        router.execute(commands, inputs);
    }

    function test_resolve_revertingResolver_allowRevertContinues() public {
        RevertingResolver resolver = new RevertingResolver();
        // FLAG_ALLOW_REVERT on the RESOLVE command; the following TRANSFER uses a literal amount.
        bytes memory commands = abi.encodePacked(
            bytes1(uint8(Commands.RESOLVE) | uint8(Commands.FLAG_ALLOW_REVERT)), bytes1(uint8(Commands.TRANSFER))
        );
        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(address(resolver), bytes(''));
        inputs[1] = abi.encode(address(erc20), RECIPIENT, uint256(1 ether));

        erc20.mint(address(router), 1 ether);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), 1 ether);
    }

    function test_resolve_shortReturnTreatedAsFailure() public {
        ShortReturnResolver resolver = new ShortReturnResolver();
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(resolver), bytes(''));

        vm.expectRevert(abi.encodeWithSelector(IUniversalRouter.ExecutionFailed.selector, uint256(0), bytes('')));
        router.execute(commands, inputs);
    }

    function test_resolve_returnBombIsBounded() public {
        BombResolver resolver = new BombResolver(N);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenTransfer(address(resolver), Constants.USE_RESOLVED_AMOUNT);

        erc20.mint(address(router), N);
        // The router copies only 32 bytes of returndata, so the oversized return neither corrupts
        // the resolved value nor imposes copy cost on the router.
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), N);
    }

    function test_resolve_registerClearedBetweenExecutes() public {
        MockResolver resolver = new MockResolver(N);

        // First top-level execute resolves N into the register, then the register is cleared on exit.
        bytes memory resolveOnly = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)));
        bytes[] memory resolveInputs = new bytes[](1);
        resolveInputs[0] = abi.encode(address(resolver), bytes(''));
        router.execute(resolveOnly, resolveInputs);

        // A later execute that consumes the sentinel finds the register empty rather than holding the stale N.
        bytes memory transferOnly = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory transferInputs = new bytes[](1);
        transferInputs[0] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);
        erc20.mint(address(router), N);

        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        router.execute(transferOnly, transferInputs);
    }

    function test_resolve_sentinelWithoutResolve_reverts() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);
        erc20.mint(address(router), N);

        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        router.execute(commands, inputs);
    }

    function test_resolve_zeroResult_failsCommand() public {
        MockResolver resolver = new MockResolver(0);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(resolver), bytes(''));

        vm.expectRevert(abi.encodeWithSelector(IUniversalRouter.ExecutionFailed.selector, uint256(0), bytes('')));
        router.execute(commands, inputs);
    }

    function test_resolve_zeroResult_allowRevert_consumerReverts() public {
        MockResolver resolver = new MockResolver(0);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenTransfer(address(resolver), Constants.USE_RESOLVED_AMOUNT);
        commands[0] = bytes1(uint8(Commands.RESOLVE) | uint8(Commands.FLAG_ALLOW_REVERT));
        erc20.mint(address(router), N);

        // The tolerated failure leaves the register empty, so the consumer cannot fall through to a zero amount.
        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        router.execute(commands, inputs);
    }

    /// @dev The sequence from review: a value in the register, a later RESOLVE that fails, and a consumer that
    /// must not pick up the earlier value.
    function test_resolve_failedResolve_clearsEarlierValue() public {
        MockResolver good = new MockResolver(N);
        RevertingResolver bad = new RevertingResolver();
        bytes memory commands = abi.encodePacked(
            bytes1(uint8(Commands.RESOLVE)),
            bytes1(uint8(Commands.RESOLVE) | uint8(Commands.FLAG_ALLOW_REVERT)),
            bytes1(uint8(Commands.TRANSFER))
        );
        bytes[] memory inputs = new bytes[](3);
        inputs[0] = abi.encode(address(good), bytes(''));
        inputs[1] = abi.encode(address(bad), bytes(''));
        inputs[2] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);
        erc20.mint(address(router), N);

        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        router.execute(commands, inputs);
    }

    /// @dev The supported way to tolerate a failed RESOLVE: consume the sentinel inside a sub-plan that also allows
    /// revert, so the plan continues past it.
    function test_resolve_failedResolve_toleratedInSubPlan() public {
        MockResolver resolver = new MockResolver(0);

        bytes memory subCommands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory subInputs = new bytes[](1);
        subInputs[0] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);

        bytes memory commands = abi.encodePacked(
            bytes1(uint8(Commands.RESOLVE) | uint8(Commands.FLAG_ALLOW_REVERT)),
            bytes1(uint8(Commands.EXECUTE_SUB_PLAN) | uint8(Commands.FLAG_ALLOW_REVERT)),
            bytes1(uint8(Commands.TRANSFER))
        );
        bytes[] memory inputs = new bytes[](3);
        inputs[0] = abi.encode(address(resolver), bytes(''));
        inputs[1] = abi.encode(subCommands, subInputs);
        inputs[2] = abi.encode(address(erc20), RECIPIENT, uint256(1 ether));
        erc20.mint(address(router), N);

        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), 1 ether, 'only the literal transfer after the sub-plan ran');
    }
}

/// @notice Exercises the USE_RESOLVED_AMOUNT sentinel in the amount fields of PERMIT2_TRANSFER_FROM and
/// PERMIT2_TRANSFER_FROM_BATCH, which lets a route pull exactly the amount a prior RESOLVE produced instead
/// of an offchain upper bound.
contract ResolvePermit2TransferTest is Test, DeployPermit2 {
    address constant RECIPIENT = address(1234);
    address constant RECIPIENT2 = address(5678);
    uint256 constant N = 7_777 ether;

    UniversalRouter router;
    MockERC20 erc20;
    address user = makeAddr('user');

    function setUp() public {
        IAllowanceTransfer permit2 = IAllowanceTransfer(deployPermit2());
        RouterParameters memory params = RouterParameters({
            permit2: address(permit2),
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
        });
        router = new UniversalRouter(params);
        erc20 = new MockERC20();

        erc20.mint(user, 2 * N);
        vm.startPrank(user);
        erc20.approve(address(permit2), type(uint256).max);
        permit2.approve(address(erc20), address(router), type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function _resolveThenPermit2Transfer(address resolver, uint256 transferAmount)
        internal
        view
        returns (bytes memory commands, bytes[] memory inputs)
    {
        commands = abi.encodePacked(bytes1(uint8(Commands.RESOLVE)), bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM)));
        inputs = new bytes[](2);
        inputs[0] = abi.encode(resolver, bytes(''));
        inputs[1] = abi.encode(address(erc20), RECIPIENT, transferAmount);
    }

    function test_permit2TransferFrom_pullsResolvedAmount() public {
        MockResolver resolver = new MockResolver(N);
        (bytes memory commands, bytes[] memory inputs) =
            _resolveThenPermit2Transfer(address(resolver), Constants.USE_RESOLVED_AMOUNT);

        vm.prank(user);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), N);
        assertEq(erc20.balanceOf(user), N);
    }

    function test_permit2TransferFrom_literalAmountUnaffected() public {
        MockResolver resolver = new MockResolver(N);
        (bytes memory commands, bytes[] memory inputs) = _resolveThenPermit2Transfer(address(resolver), 1 ether);

        vm.prank(user);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), 1 ether);
    }

    function test_permit2TransferFrom_sentinelWithoutResolve_reverts() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);

        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        vm.prank(user);
        router.execute(commands, inputs);
    }

    function _batch(uint160 amount0, uint160 amount1)
        internal
        view
        returns (IAllowanceTransfer.AllowanceTransferDetails[] memory details)
    {
        details = new IAllowanceTransfer.AllowanceTransferDetails[](2);
        details[0] = IAllowanceTransfer.AllowanceTransferDetails({
            from: user, to: RECIPIENT, amount: amount0, token: address(erc20)
        });
        details[1] = IAllowanceTransfer.AllowanceTransferDetails({
            from: user, to: RECIPIENT2, amount: amount1, token: address(erc20)
        });
    }

    function test_permit2TransferFromBatch_pullsResolvedAmount() public {
        MockResolver resolver = new MockResolver(N);
        bytes memory commands =
            abi.encodePacked(bytes1(uint8(Commands.RESOLVE)), bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM_BATCH)));
        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(address(resolver), bytes(''));
        // one detail consumes the resolved amount, the other carries a literal
        inputs[1] = abi.encode(_batch(uint160(Constants.USE_RESOLVED_AMOUNT), 1 ether));

        vm.prank(user);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(RECIPIENT), N);
        assertEq(erc20.balanceOf(RECIPIENT2), 1 ether);
        assertEq(erc20.balanceOf(user), N - 1 ether);
    }

    function test_permit2TransferFromBatch_sentinelWithoutResolve_reverts() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM_BATCH)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(_batch(1 ether, uint160(Constants.USE_RESOLVED_AMOUNT)));

        vm.expectRevert(ResolvedAmount.ResolvedAmountUnset.selector);
        vm.prank(user);
        router.execute(commands, inputs);
    }

    function _batchInput(IAllowanceTransfer.AllowanceTransferDetails[] memory details)
        internal
        pure
        returns (bytes memory input)
    {
        input = abi.encode(details);
    }

    function _executeBatch(bytes memory input) internal {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM_BATCH)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = input;
        vm.prank(user);
        router.execute(commands, inputs);
    }

    /// @dev Sets the bits above an entry field's ABI type: word `field` (0 from, 1 to, 2 amount, 3 token) of
    /// entry `entry`, after the 0x20 array offset and 0x20 length words.
    function _dirty(bytes memory input, uint256 entry, uint256 field) internal pure {
        uint256 position = 0x20 + 0x40 + entry * 0x80 + field * 0x20;
        assembly {
            let word := mload(add(input, position))
            mstore(add(input, position), or(word, shl(200, 1)))
        }
    }

    function test_permit2TransferFromBatch_rejectsTruncatedDetails() public {
        bytes memory input = _batchInput(_batch(1 ether, 1 ether));
        // drop the last word, so the declared length of two entries no longer fits the input
        assembly {
            mstore(input, sub(mload(input), 0x20))
        }
        vm.expectRevert(CalldataDecoder.SliceOutOfBounds.selector);
        _executeBatch(input);
    }

    function test_permit2TransferFromBatch_rejectsOverstatedLength() public {
        bytes memory input = _batchInput(_batch(1 ether, 1 ether));
        // claim three entries while only two are encoded
        assembly {
            mstore(add(input, 0x40), 3)
        }
        vm.expectRevert(CalldataDecoder.SliceOutOfBounds.selector);
        _executeBatch(input);
    }

    function test_permit2TransferFromBatch_rejectsDirtyFields() public {
        for (uint256 field = 0; field < 4; field++) {
            bytes memory input = _batchInput(_batch(1 ether, 1 ether));
            _dirty(input, 1, field);
            vm.expectRevert();
            _executeBatch(input);
        }
        assertEq(erc20.balanceOf(RECIPIENT), 0);
        assertEq(erc20.balanceOf(RECIPIENT2), 0);
    }

    function test_permit2TransferFromBatch_rejectsForeignOwner() public {
        IAllowanceTransfer.AllowanceTransferDetails[] memory details = _batch(1 ether, 1 ether);
        details[1].from = RECIPIENT;
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM_BATCH)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(details);

        vm.expectRevert(Permit2Payments.FromAddressIsNotOwner.selector);
        vm.prank(user);
        router.execute(commands, inputs);
    }
}

