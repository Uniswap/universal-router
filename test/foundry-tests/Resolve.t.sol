// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockResolver, RevertingResolver, ShortReturnResolver, BombResolver} from './mock/MockResolver.sol';

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

        // A later execute that consumes the sentinel sees a cleared (zero) register, not the stale N.
        bytes memory transferOnly = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory transferInputs = new bytes[](1);
        transferInputs[0] = abi.encode(address(erc20), RECIPIENT, Constants.USE_RESOLVED_AMOUNT);
        erc20.mint(address(router), N);
        router.execute(transferOnly, transferInputs);

        assertEq(erc20.balanceOf(RECIPIENT), 0);
    }
}
