// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {DeployPermit2} from 'permit2/test/utils/DeployPermit2.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Permit2Payments} from '../../contracts/modules/Permit2Payments.sol';
import {MockERC20} from './mock/MockERC20.sol';

/// @notice PERMIT2_TRANSFER_FROM_BATCH resolves each detail's recipient through the same sentinel table as every
/// other recipient field, so MSG_SENDER and ADDRESS_THIS deliver to the caller and the router rather than to the
/// literal addresses 1 and 2.
contract Permit2TransferFromBatchTest is Test, DeployPermit2 {
    address constant RECIPIENT = address(1234);
    uint160 constant AMOUNT = 5 ether;

    UniversalRouter router;
    MockERC20 erc20;
    address user = makeAddr('user');
    address other = makeAddr('other');

    function setUp() public {
        IAllowanceTransfer permit2 = IAllowanceTransfer(deployPermit2());
        router = new UniversalRouter(
            RouterParameters({
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
            })
        );
        erc20 = new MockERC20();

        erc20.mint(user, 4 * AMOUNT);
        vm.startPrank(user);
        erc20.approve(address(permit2), type(uint256).max);
        permit2.approve(address(erc20), address(router), type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function _batch(address from, address to0, address to1)
        internal
        view
        returns (bytes memory commands, bytes[] memory inputs)
    {
        IAllowanceTransfer.AllowanceTransferDetails[] memory details =
            new IAllowanceTransfer.AllowanceTransferDetails[](2);
        details[0] =
            IAllowanceTransfer.AllowanceTransferDetails({from: from, to: to0, amount: AMOUNT, token: address(erc20)});
        details[1] =
            IAllowanceTransfer.AllowanceTransferDetails({from: from, to: to1, amount: AMOUNT, token: address(erc20)});

        commands = abi.encodePacked(bytes1(uint8(Commands.PERMIT2_TRANSFER_FROM_BATCH)));
        inputs = new bytes[](1);
        inputs[0] = abi.encode(details);
    }

    function test_permit2TransferFromBatch_addressThisRecipient_deliversToRouter() public {
        (bytes memory commands, bytes[] memory inputs) = _batch(user, ActionConstants.ADDRESS_THIS, RECIPIENT);

        vm.prank(user);
        router.execute(commands, inputs);

        assertEq(erc20.balanceOf(address(router)), AMOUNT, 'ADDRESS_THIS maps to the router');
        assertEq(erc20.balanceOf(RECIPIENT), AMOUNT, 'a literal recipient is untouched');
        assertEq(erc20.balanceOf(ActionConstants.ADDRESS_THIS), 0, 'nothing reaches address(2)');
        assertEq(erc20.balanceOf(user), 2 * AMOUNT);
    }

    function test_permit2TransferFromBatch_msgSenderRecipient_deliversToCaller() public {
        (bytes memory commands, bytes[] memory inputs) = _batch(user, ActionConstants.MSG_SENDER, RECIPIENT);

        vm.prank(user);
        router.execute(commands, inputs);

        // the MSG_SENDER detail round-trips to the caller, so only the literal detail leaves the user's balance
        assertEq(erc20.balanceOf(user), 3 * AMOUNT, 'MSG_SENDER maps to the caller');
        assertEq(erc20.balanceOf(RECIPIENT), AMOUNT);
        assertEq(erc20.balanceOf(ActionConstants.MSG_SENDER), 0, 'nothing reaches address(1)');
    }

    function test_permit2TransferFromBatch_fromIsNotCaller_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _batch(other, RECIPIENT, RECIPIENT);

        vm.expectRevert(Permit2Payments.FromAddressIsNotOwner.selector);
        vm.prank(user);
        router.execute(commands, inputs);
    }
}
