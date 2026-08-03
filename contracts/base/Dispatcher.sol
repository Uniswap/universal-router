// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {V2SwapRouter} from '../modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from '../modules/uniswap/v3/V3SwapRouter.sol';
import {V4SwapRouter} from '../modules/uniswap/v4/V4SwapRouter.sol';
import {BytesLib} from '../modules/uniswap/v3/BytesLib.sol';
import {Payments} from '../modules/Payments.sol';
import {PaymentsImmutables} from '../modules/PaymentsImmutables.sol';
import {V3ToV4Migrator} from '../modules/V3ToV4Migrator.sol';
import {Commands} from '../libraries/Commands.sol';
import {Lock} from './Lock.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {TransientStateLibrary} from '@uniswap/v4-core/src/libraries/TransientStateLibrary.sol';
import {ChainedActions} from '../modules/ChainedActions.sol';

/// @title Decodes and Executes Commands
/// @notice Called by the UniversalRouter contract to efficiently decode and execute a singular command
abstract contract Dispatcher is
    Payments,
    V2SwapRouter,
    V3SwapRouter,
    V4SwapRouter,
    V3ToV4Migrator,
    Lock,
    ChainedActions
{
    using BytesLib for bytes;
    using CalldataDecoder for bytes;
    using TransientStateLibrary for IPoolManager;

    error InvalidCommandType(uint256 commandType);
    error BalanceTooLow();

    /// @notice Executes encoded commands along with provided inputs.
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable virtual;

    /// @notice Public view function to be used instead of msg.sender, as the contract performs self-reentrancy and at
    /// times msg.sender == address(this). Instead msgSender() returns the initiator of the lock
    /// @dev overrides BaseActionsRouter.msgSender in V4Router
    function msgSender() public view override returns (address) {
        return _getLocker();
    }

    /// @notice Decodes and executes the given command with the given inputs
    /// @param commandType The command type to execute
    /// @param inputs The inputs to execute the command with
    /// @dev 2 masks are used to enable use of a nested-if statement in execution for efficiency reasons
    /// @return success True on success of the command, false on failure
    /// @return output The outputs or error messages, if any, from the command
    function dispatch(bytes1 commandType, bytes calldata inputs) internal returns (bool success, bytes memory output) {
        uint256 command = uint8(commandType & Commands.COMMAND_TYPE_MASK);

        success = true;

        // 0x00 <= command < 0x21
        if (command < Commands.EXECUTE_SUB_PLAN) {
            // 0x00 <= command < 0x10
            if (command < Commands.V4_SWAP) {
                // 0x00 <= command < 0x08
                if (command < Commands.V2_SWAP_EXACT_IN) {
                    if (command == Commands.V3_SWAP_EXACT_IN) {
                        checkInputLength(inputs, 0xc0);
                        // equivalent: abi.decode(inputs, (address, uint256, uint256, bytes, bool, uint256[]))
                        address recipient;
                        uint256 amountIn;
                        uint256 amountOutMin;
                        bool payerIsUser;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amountIn := calldataload(add(inputs.offset, 0x20))
                            amountOutMin := calldataload(add(inputs.offset, 0x40))
                            // 0x60 offset is the path, decoded below
                            payerIsUser := calldataload(add(inputs.offset, 0x80))
                        }
                        bytes calldata path = inputs.toBytes(3);
                        uint256[] calldata minHopPriceX36 = inputs.toUint256Array(5);
                        address payer = payerIsUser ? msgSender() : address(this);
                        v3SwapExactInput(map(recipient), amountIn, amountOutMin, path, payer, minHopPriceX36);
                    } else if (command == Commands.V3_SWAP_EXACT_OUT) {
                        checkInputLength(inputs, 0xc0);
                        // equivalent: abi.decode(inputs, (address, uint256, uint256, bytes, bool, uint256[]))
                        address recipient;
                        uint256 amountOut;
                        uint256 amountInMax;
                        bool payerIsUser;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amountOut := calldataload(add(inputs.offset, 0x20))
                            amountInMax := calldataload(add(inputs.offset, 0x40))
                            // 0x60 offset is the path, decoded below
                            payerIsUser := calldataload(add(inputs.offset, 0x80))
                        }
                        bytes calldata path = inputs.toBytes(3);
                        uint256[] calldata minHopPriceX36 = inputs.toUint256Array(5);
                        address payer = payerIsUser ? msgSender() : address(this);
                        v3SwapExactOutput(map(recipient), amountOut, amountInMax, path, payer, minHopPriceX36);
                    } else if (command == Commands.PERMIT2_TRANSFER_FROM) {
                        checkInputLength(inputs, 0x60);
                        // equivalent: abi.decode(inputs, (address, address, uint160))
                        address token;
                        address recipient;
                        uint160 amount;
                        assembly {
                            token := calldataload(inputs.offset)
                            recipient := calldataload(add(inputs.offset, 0x20))
                            amount := calldataload(add(inputs.offset, 0x40))
                        }
                        permit2TransferFrom(token, msgSender(), map(recipient), amount);
                    } else if (command == Commands.PERMIT2_PERMIT_BATCH) {
                        IAllowanceTransfer.PermitBatch calldata permitBatch = decodePermitBatch(inputs);
                        bytes calldata data = inputs.toBytes(1);
                        (success, output) = address(PERMIT2)
                            .call(
                                abi.encodeWithSignature(
                                    'permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)',
                                    msgSender(),
                                    permitBatch,
                                    data
                                )
                            );
                    } else if (command == Commands.SWEEP) {
                        checkInputLength(inputs, 0x60);
                        // equivalent:  abi.decode(inputs, (address, address, uint256))
                        address token;
                        address recipient;
                        uint160 amountMin;
                        assembly {
                            token := calldataload(inputs.offset)
                            recipient := calldataload(add(inputs.offset, 0x20))
                            amountMin := calldataload(add(inputs.offset, 0x40))
                        }
                        Payments.sweep(token, map(recipient), amountMin);
                    } else if (command == Commands.TRANSFER) {
                        checkInputLength(inputs, 0x60);
                        // equivalent:  abi.decode(inputs, (address, address, uint256))
                        address token;
                        address recipient;
                        uint256 value;
                        assembly {
                            token := calldataload(inputs.offset)
                            recipient := calldataload(add(inputs.offset, 0x20))
                            value := calldataload(add(inputs.offset, 0x40))
                        }
                        Payments.pay(token, map(recipient), value);
                    } else if (command == Commands.PAY_PORTION) {
                        checkInputLength(inputs, 0x60);
                        // equivalent:  abi.decode(inputs, (address, address, uint256))
                        address token;
                        address recipient;
                        uint256 bips;
                        assembly {
                            token := calldataload(inputs.offset)
                            recipient := calldataload(add(inputs.offset, 0x20))
                            bips := calldataload(add(inputs.offset, 0x40))
                        }
                        Payments.payPortion(token, map(recipient), bips);
                    } else if (command == Commands.PAY_PORTION_FULL_PRECISION) {
                        checkInputLength(inputs, 0x60);
                        // equivalent:  abi.decode(inputs, (address, address, uint256))
                        address token;
                        address recipient;
                        uint256 portion;
                        assembly {
                            token := calldataload(inputs.offset)
                            recipient := calldataload(add(inputs.offset, 0x20))
                            portion := calldataload(add(inputs.offset, 0x40))
                        }
                        Payments.payPortionFullPrecision(token, map(recipient), portion);
                    }
                } else {
                    // 0x08 <= command < 0x10
                    if (command == Commands.V2_SWAP_EXACT_IN) {
                        checkInputLength(inputs, 0xc0);
                        // equivalent: abi.decode(inputs, (address, uint256, uint256, address[], bool, uint256[]))
                        address recipient;
                        uint256 amountIn;
                        uint256 amountOutMin;
                        bool payerIsUser;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amountIn := calldataload(add(inputs.offset, 0x20))
                            amountOutMin := calldataload(add(inputs.offset, 0x40))
                            // 0x60 offset is the path, decoded below
                            payerIsUser := calldataload(add(inputs.offset, 0x80))
                        }
                        address[] calldata path = inputs.toAddressArray(3);
                        uint256[] calldata minHopPriceX36 = inputs.toUint256Array(5);
                        address payer = payerIsUser ? msgSender() : address(this);
                        v2SwapExactInput(map(recipient), amountIn, amountOutMin, path, payer, minHopPriceX36);
                    } else if (command == Commands.V2_SWAP_EXACT_OUT) {
                        checkInputLength(inputs, 0xc0);
                        // equivalent: abi.decode(inputs, (address, uint256, uint256, address[], bool, uint256[]))
                        address recipient;
                        uint256 amountOut;
                        uint256 amountInMax;
                        bool payerIsUser;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amountOut := calldataload(add(inputs.offset, 0x20))
                            amountInMax := calldataload(add(inputs.offset, 0x40))
                            // 0x60 offset is the path, decoded below
                            payerIsUser := calldataload(add(inputs.offset, 0x80))
                        }
                        address[] calldata path = inputs.toAddressArray(3);
                        uint256[] calldata minHopPriceX36 = inputs.toUint256Array(5);
                        address payer = payerIsUser ? msgSender() : address(this);
                        v2SwapExactOutput(map(recipient), amountOut, amountInMax, path, payer, minHopPriceX36);
                    } else if (command == Commands.PERMIT2_PERMIT) {
                        checkInputLength(inputs, 0xe0);
                        // equivalent: abi.decode(inputs, (IAllowanceTransfer.PermitSingle, bytes))
                        IAllowanceTransfer.PermitSingle calldata permitSingle;
                        assembly {
                            permitSingle := inputs.offset
                        }
                        bytes calldata data = inputs.toBytes(6); // PermitSingle takes first 6 slots (0..5)
                        (success, output) = address(PERMIT2)
                            .call(
                                abi.encodeWithSignature(
                                    'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
                                    msgSender(),
                                    permitSingle,
                                    data
                                )
                            );
                    } else if (command == Commands.WRAP_ETH) {
                        checkInputLength(inputs, 0x40);
                        // equivalent: abi.decode(inputs, (address, uint256))
                        address recipient;
                        uint256 amount;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amount := calldataload(add(inputs.offset, 0x20))
                        }
                        Payments.wrapETH(map(recipient), amount);
                    } else if (command == Commands.UNWRAP_WETH) {
                        checkInputLength(inputs, 0x40);
                        // equivalent: abi.decode(inputs, (address, uint256))
                        address recipient;
                        uint256 amountMin;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amountMin := calldataload(add(inputs.offset, 0x20))
                        }
                        Payments.unwrapWETH9(map(recipient), amountMin);
                    } else if (command == Commands.PERMIT2_TRANSFER_FROM_BATCH) {
                        IAllowanceTransfer.AllowanceTransferDetails[] calldata batchDetails;
                        (uint256 length, uint256 offset) = inputs.toLengthOffset(0, 0x80);
                        assembly {
                            batchDetails.length := length
                            batchDetails.offset := offset
                        }
                        permit2TransferFrom(batchDetails, msgSender());
                    } else if (command == Commands.BALANCE_CHECK_ERC20) {
                        checkInputLength(inputs, 0x60);
                        // equivalent: abi.decode(inputs, (address, address, uint256))
                        address owner;
                        address token;
                        uint256 minBalance;
                        assembly {
                            owner := calldataload(inputs.offset)
                            token := calldataload(add(inputs.offset, 0x20))
                            minBalance := calldataload(add(inputs.offset, 0x40))
                        }
                        success = (ERC20(token).balanceOf(owner) >= minBalance);
                        if (!success) output = abi.encodePacked(BalanceTooLow.selector);
                    } else if (command == Commands.UNWRAP_WETH_EXACT) {
                        checkInputLength(inputs, 0x40);
                        // equivalent: abi.decode(inputs, (address, uint256))
                        address recipient;
                        uint256 amount;
                        assembly {
                            recipient := calldataload(inputs.offset)
                            amount := calldataload(add(inputs.offset, 0x20))
                        }
                        Payments.unwrapWETH9Exact(map(recipient), amount);
                    }
                }
            } else {
                // 0x10 <= command < 0x21
                if (command == Commands.V4_SWAP) {
                    // If the PoolManager is already unlocked, this contract is executing inside another
                    // contract's unlock callback. Opening a new lock via _executeActions would revert with
                    // AlreadyUnlocked, so instead run the v4 actions within the existing lock.
                    if (poolManager.isUnlocked()) {
                        (bytes calldata actions, bytes[] calldata params) = inputs.decodeActionsRouterParams();
                        _executeActionsWithoutUnlock(actions, params);
                    } else {
                        // pass the calldata provided to V4SwapRouter._executeActions (defined in BaseActionsRouter)
                        _executeActions(inputs);
                    }
                    // This contract MUST be approved to spend the token since its going to be doing the call on the position manager
                } else if (command == Commands.V3_POSITION_MANAGER_PERMIT) {
                    _checkV3PermitCall(inputs);
                    (success, output) = address(V3_POSITION_MANAGER).call(inputs);
                } else if (command == Commands.V3_POSITION_MANAGER_CALL) {
                    _checkV3PositionManagerCall(inputs, msgSender());
                    (success, output) = address(V3_POSITION_MANAGER).call(inputs);
                } else if (command == Commands.V4_INITIALIZE_POOL) {
                    checkInputLength(inputs, 0xc0);
                    PoolKey calldata poolKey;
                    uint160 sqrtPriceX96;
                    assembly {
                        poolKey := inputs.offset
                        sqrtPriceX96 := calldataload(add(inputs.offset, 0xa0))
                    }
                    (success, output) =
                        address(poolManager).call(abi.encodeCall(IPoolManager.initialize, (poolKey, sqrtPriceX96)));
                } else if (command == Commands.V4_POSITION_MANAGER_CALL) {
                    // should only call modifyLiquidities() to mint
                    _checkV4PositionManagerCall(inputs);
                    (success, output) = address(V4_POSITION_MANAGER).call{value: address(this).balance}(inputs);
                } else {
                    // placeholder area for commands 0x15-0x20
                    revert InvalidCommandType(command);
                }
            }
        } else if (command < Commands.ACROSS_V4_DEPOSIT_V3) {
            // 0x21 <= command
            if (command == Commands.EXECUTE_SUB_PLAN) {
                (bytes calldata _commands, bytes[] calldata _inputs) = inputs.decodeCommandsAndInputs();
                (success, output) = (address(this)).call(abi.encodeCall(Dispatcher.execute, (_commands, _inputs)));
            } else {
                // placeholder area for commands 0x22-0x3f
                revert InvalidCommandType(command);
            }
        } else {
            if (command == Commands.ACROSS_V4_DEPOSIT_V3) {
                _acrossV4DepositV3(inputs);
            } else {
                // placeholder area for commands 0x41-0x5f
                revert InvalidCommandType(command);
            }
        }
    }

    /// @dev Reverts if an input cannot contain the complete static ABI head consumed by a command.
    function checkInputLength(bytes calldata input, uint256 minimumLength) private pure {
        if (input.length < minimumLength) revert CalldataDecoder.SliceOutOfBounds();
    }

    /// @dev Decodes a Permit2 batch after validating its dynamic details array against the input bounds.
    function decodePermitBatch(bytes calldata input)
        private
        pure
        returns (IAllowanceTransfer.PermitBatch calldata permitBatch)
    {
        checkInputLength(input, 0x40);

        assembly ('memory-safe') {
            let inputLength := input.length
            let permitBatchOffset := calldataload(input.offset)

            // PermitBatch has a three-word head: details offset, spender, and signature deadline.
            if or(lt(inputLength, 0x60), gt(permitBatchOffset, sub(inputLength, 0x60))) {
                mstore(0, 0x3b99b53d) // SliceOutOfBounds()
                revert(0x1c, 0x04)
            }

            let permitBatchPointer := add(input.offset, permitBatchOffset)
            let detailsOffset := calldataload(permitBatchPointer)
            let permitBatchLength := sub(inputLength, permitBatchOffset)

            // The PermitDetails array length word must be contained in the PermitBatch slice.
            if gt(detailsOffset, sub(permitBatchLength, 0x20)) {
                mstore(0, 0x3b99b53d) // SliceOutOfBounds()
                revert(0x1c, 0x04)
            }

            let detailsLengthPointer := add(permitBatchPointer, detailsOffset)
            let detailsLength := calldataload(detailsLengthPointer)
            let detailsDataOffset := add(detailsOffset, 0x20)
            let remainingLength := sub(permitBatchLength, detailsDataOffset)

            // Each PermitDetails element occupies four words.
            if gt(detailsLength, div(remainingLength, 0x80)) {
                mstore(0, 0x3b99b53d) // SliceOutOfBounds()
                revert(0x1c, 0x04)
            }

            permitBatch := permitBatchPointer
        }
    }

    /// @notice Calculates the recipient address for a command
    /// @param recipient The recipient or recipient-flag for the command
    /// @return output The resultant recipient for the command
    function map(address recipient) internal view returns (address) {
        if (recipient == ActionConstants.MSG_SENDER) {
            return msgSender();
        } else if (recipient == ActionConstants.ADDRESS_THIS) {
            return address(this);
        } else {
            return recipient;
        }
    }
}
