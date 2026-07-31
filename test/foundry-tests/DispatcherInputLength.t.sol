// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {Dispatcher} from '../../contracts/base/Dispatcher.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';

/// @notice Every command that reads fixed fields with `calldataload` must reject an input shorter
/// than the bytes it reads. Without the guard those reads run past `inputs[i].length` into adjacent
/// calldata — bytes that `executeSigned`'s EIP-712 input hash never covered.
contract DispatcherInputLengthTest is Test {
    address constant RECIPIENT = address(0x1234);

    UniversalRouter router;

    struct Case {
        uint256 command;
        uint256 minLength;
        string name;
    }

    Case[] cases;

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

        cases.push(Case(Commands.V3_SWAP_EXACT_IN, 0xc0, 'V3_SWAP_EXACT_IN'));
        cases.push(Case(Commands.V3_SWAP_EXACT_OUT, 0xc0, 'V3_SWAP_EXACT_OUT'));
        cases.push(Case(Commands.PERMIT2_TRANSFER_FROM, 0x60, 'PERMIT2_TRANSFER_FROM'));
        cases.push(Case(Commands.SWEEP, 0x60, 'SWEEP'));
        cases.push(Case(Commands.TRANSFER, 0x60, 'TRANSFER'));
        cases.push(Case(Commands.PAY_PORTION, 0x60, 'PAY_PORTION'));
        cases.push(Case(Commands.PAY_PORTION_FULL_PRECISION, 0x60, 'PAY_PORTION_FULL_PRECISION'));
        cases.push(Case(Commands.V2_SWAP_EXACT_IN, 0xc0, 'V2_SWAP_EXACT_IN'));
        cases.push(Case(Commands.V2_SWAP_EXACT_OUT, 0xc0, 'V2_SWAP_EXACT_OUT'));
        cases.push(Case(Commands.WRAP_ETH, 0x40, 'WRAP_ETH'));
        cases.push(Case(Commands.UNWRAP_WETH, 0x40, 'UNWRAP_WETH'));
        cases.push(Case(Commands.BALANCE_CHECK_ERC20, 0x60, 'BALANCE_CHECK_ERC20'));
        cases.push(Case(Commands.V4_INITIALIZE_POOL, 0xc0, 'V4_INITIALIZE_POOL'));
    }

    function _cmd(uint256 command) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(uint8(command)));
    }

    function _run(uint256 command, uint256 inputLength) internal {
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = new bytes(inputLength);
        router.execute(_cmd(command), inputs);
    }

    /// @notice A zero-length input must revert for every fixed-field command.
    function test_zeroLengthInput_revertsForEveryFixedFieldCommand() public {
        for (uint256 i = 0; i < cases.length; ++i) {
            vm.expectRevert(Dispatcher.InvalidInputLength.selector);
            _run(cases[i].command, 0);
        }
    }

    /// @notice One byte short of the required length must also revert — the boundary, not just zero.
    function test_oneByteShort_revertsForEveryFixedFieldCommand() public {
        for (uint256 i = 0; i < cases.length; ++i) {
            vm.expectRevert(Dispatcher.InvalidInputLength.selector);
            _run(cases[i].command, cases[i].minLength - 1);
        }
    }

    /// @notice At exactly the required length the guard must not fire. These inputs are all-zero so
    /// most commands still fail downstream; the assertion is only that the failure is never
    /// InvalidInputLength.
    function test_exactMinimumLength_doesNotRevertWithInvalidInputLength() public {
        for (uint256 i = 0; i < cases.length; ++i) {
            bytes[] memory inputs = new bytes[](1);
            inputs[0] = new bytes(cases[i].minLength);
            try router.execute(_cmd(cases[i].command), inputs) {
                // guard did not fire
            } catch (bytes memory reason) {
                assertTrue(
                    bytes4(reason) != Dispatcher.InvalidInputLength.selector,
                    string.concat('guard fired at exact minimum length for ', cases[i].name)
                );
            }
        }
    }

    /// @notice Positive control: a correctly encoded TRANSFER still works.
    function test_correctlyEncodedTransfer_stillSucceeds() public {
        uint256 amount = 1 ether;
        vm.deal(address(this), amount);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, RECIPIENT, amount);
        assertEq(inputs[0].length, 0x60, 'payload is 3 words');

        router.execute{value: amount}(_cmd(Commands.TRANSFER), inputs);

        assertEq(RECIPIENT.balance, amount, 'recipient received the transfer');
    }

    /// @notice The concrete shape from Cantina #703: a signature-covered empty input with three
    /// attacker-chosen words parked immediately after the zero length word. Reaching dispatch with
    /// `inputs[0].length == 0` is now rejected outright.
    function test_smuggledWordsAfterZeroLength_areRejected() public {
        vm.deal(address(this), 1 ether);

        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256('execute(bytes,bytes[])')), _cmd(Commands.TRANSFER), _singleInput()
        );
        _zeroFirstInputLengthWord(callData);

        (bool success, bytes memory returnData) = address(router).call{value: 1 ether}(callData);

        assertFalse(success, 'smuggled execution must not succeed');
        assertEq(bytes4(returnData), Dispatcher.InvalidInputLength.selector, 'must revert InvalidInputLength');
        assertEq(RECIPIENT.balance, 0, 'recipient must receive nothing');
    }

    function _singleInput() internal pure returns (bytes[] memory inputs) {
        inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, RECIPIENT, uint256(1 ether));
    }

    /// @notice Rewrites the first `bytes` element's length word to zero, leaving its three data
    /// words physically present in calldata. This is the non-canonical encoding the finding relies
    /// on: the decoder reports an empty input while the words remain readable via `calldataload`.
    function _zeroFirstInputLengthWord(bytes memory callData) internal pure {
        uint256 argsStart;
        assembly {
            argsStart := add(add(callData, 0x20), 0x04)
        }

        uint256 inputsOffset;
        assembly {
            inputsOffset := mload(add(argsStart, 0x20))
        }
        uint256 inputsStart = argsStart + inputsOffset;

        uint256 arrayLength;
        assembly {
            arrayLength := mload(inputsStart)
        }
        require(arrayLength == 1, 'bad inputs length');

        uint256 firstInputOffset;
        assembly {
            firstInputOffset := mload(add(inputsStart, 0x20))
        }

        uint256 firstInputLengthPtr = inputsStart + firstInputOffset;
        uint256 firstInputLength;
        assembly {
            firstInputLength := mload(firstInputLengthPtr)
        }

        if (firstInputLength != 0x60) {
            firstInputLengthPtr = inputsStart + 0x20 + firstInputOffset;
            assembly {
                firstInputLength := mload(firstInputLengthPtr)
            }
        }
        require(firstInputLength == 0x60, 'bad first input length');

        assembly {
            mstore(firstInputLengthPtr, 0)
        }
    }
}
