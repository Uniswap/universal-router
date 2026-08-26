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
import {Permit2AllowanceMock} from './V4SwapWithinUnlock.t.sol';

/// @notice Opens the v4 lock and forwards a RAW calldata blob to the router from inside the unlock callback.
/// @dev A normal Solidity call would re-encode the arguments and drop any trailing bytes, so smuggling can
///      only be exercised through a low-level call that preserves the blob verbatim.
contract RawLockHolder is IUnlockCallback {
    IPoolManager public immutable manager;
    UniversalRouter public immutable router;

    bytes internal payload;
    bool public callSucceeded;
    bytes public returnData;

    constructor(IPoolManager _manager, UniversalRouter _router) {
        manager = _manager;
        router = _router;
    }

    function attack(bytes calldata _payload) external {
        payload = _payload;
        manager.unlock(hex'');
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == address(manager), 'only manager');
        (callSucceeded, returnData) = address(router).call(payload);
        return hex'';
    }
}

/// @notice Regression coverage for the nested-unlock V4_SWAP path decoding from a canonical copy of its input.
///
/// The v4 swap parameter decoders in CalldataDecoder follow the struct offset in the first word of `params`
/// without bounding it against `params.length`. On the ordinary path that is inert, because
/// `poolManager.unlock()` re-encodes the input for `unlockCallback` and calldata therefore ends where the
/// input ends. The nested-unlock branch used to hand the decoders a slice of the original transaction
/// calldata instead, which let a redirected struct offset reach bytes past `inputs[i].length` -- bytes that
/// `executeSigned` never commits to. `Dispatcher.executeV4SwapWithinUnlock` restores the re-encode.
contract V4NestedUnlockCalldataSmugglingTest is Test, Deployers {
    UniversalRouter router;
    RawLockHolder holder;
    IAllowanceTransfer permit2;

    address constant RECIPIENT = address(0xBEEF);
    uint128 constant SMUGGLED_AMOUNT = 1e15;

    /// @dev Byte index, within `executeNested(bytes,bytes[],uint256)` calldata, of the word holding params[0]'s
    ///      struct offset. Derived from the encoding of a one-command / one-input / three-action plan:
    ///        0x004 commands offset   0x024 inputs offset    0x044 deadline          0x064 commands length
    ///        0x084 commands data     0x0a4 inputs length    0x0c4 inputs[0] offset  0x0e4 inputs[0] length
    ///        0x104 inputs[0] data
    ///      then, relative to inputs[0] data at 0x104:
    ///        +0x00 actions offset    +0x20 params offset    +0x40 actions length    +0x60 actions data
    ///        +0x80 params length     +0xa0 params[0] offset ... +0x100 params[0] length
    ///        +0x120 params[0] data   <- the struct offset word
    /// The nested entrypoint's third head word is why this sits 0x20 later than the two-argument execute().
    /// `_assertLayout` re-checks this against the real payload so a shape change fails loudly.
    uint256 constant STRUCT_OFFSET_WORD = 0x224;

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
        holder = new RawLockHolder(IPoolManager(address(manager)), router);

        // fund the router so a smuggled swap would have real currency0 available to spend
        MockERC20(Currency.unwrap(currency0)).transfer(address(router), 10e18);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev A well-formed nested plan: swap exact-in currency0 -> currency1, settle from the router's own
    ///      balance, take the output to RECIPIENT.
    function _plan(uint128 amountIn) internal view returns (bytes memory) {
        IV4Router.ExactInputSingleParams memory sp = IV4Router.ExactInputSingleParams({
            poolKey: key, zeroForOne: true, amountIn: amountIn, amountOutMinimum: 0, minHopPriceX36: 0, hookData: hex''
        });

        Plan memory plan = Planner.init();
        plan = plan.add(Actions.SWAP_EXACT_IN_SINGLE, abi.encode(sp));
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.TAKE, abi.encode(currency1, RECIPIENT, ActionConstants.OPEN_DELTA));
        return plan.encode();
    }

    /// @dev `abi.encodeCall(executeNested)` for a single V4_SWAP command carrying `planBlob`, with `tail`
    ///      appended verbatim past the end of the encoding.
    /// @dev The nested entrypoint is required here: plain execute() now refuses to reuse an unlock it did not
    ///      open, so the smuggling attempts have to opt in the same way a real composer would. An attacker can
    ///      opt themselves in, which is precisely why the re-encode remains load-bearing.
    function _rawCalldata(bytes memory planBlob, bytes memory tail) internal pure returns (bytes memory) {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = planBlob;
        return bytes.concat(
            abi.encodeWithSignature('executeNested(bytes,bytes[],uint256)', commands, inputs, type(uint256).max), tail
        );
    }

    function _word(bytes memory blob, uint256 pos) internal pure returns (uint256 value) {
        assembly ('memory-safe') {
            value := mload(add(add(blob, 0x20), pos))
        }
    }

    function _setWord(bytes memory blob, uint256 pos, uint256 value) internal pure {
        assembly ('memory-safe') {
            mstore(add(add(blob, 0x20), pos), value)
        }
    }

    /// @dev Fails loudly if the encoding shape ever moves out from under STRUCT_OFFSET_WORD.
    function _assertLayout(bytes memory payload) internal pure {
        assertEq(
            _word(payload, STRUCT_OFFSET_WORD),
            0x20,
            'layout assumption broken: STRUCT_OFFSET_WORD no longer points at the struct offset'
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The control: an untampered nested plan swaps normally through the raw-calldata path, proving
    ///         the harness itself reaches the nested branch and that the fix does not break it.
    function test_nestedUnlock_canonicalPayload_swapsNormally() public {
        bytes memory payload = _rawCalldata(_plan(SMUGGLED_AMOUNT), hex'');
        _assertLayout(payload);

        uint256 routerBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));

        holder.attack(payload);

        assertTrue(holder.callSucceeded(), 'canonical nested swap should succeed');
        assertEq(
            routerBefore - MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)),
            SMUGGLED_AMOUNT,
            'canonical nested swap should spend exactly amountIn'
        );
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT), 0, 'recipient should receive output');
    }

    /// @notice The regression: the declared input authorises nothing (its swap parameter body is blank), the
    ///         real swap struct is appended past inputs[0].length, and the struct offset is redirected at it.
    ///         The re-encode makes calldata end at the input boundary, so the redirect resolves to zeroes and
    ///         no funds move.
    function test_nestedUnlock_structOffsetRedirect_cannotReachSmuggledBytes() public {
        bytes memory planBlob = _plan(SMUGGLED_AMOUNT);

        // The real swap struct, lifted out of the plan and moved past the declared input.
        bytes memory smuggled = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,
                amountIn: SMUGGLED_AMOUNT,
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: hex''
            })
        );

        bytes memory payload = _rawCalldata(planBlob, smuggled);
        _assertLayout(payload);

        // Blank the in-bounds swap parameter body: it names no pool and no amount. params[0] runs from
        // STRUCT_OFFSET_WORD for 0x180 bytes; everything after its first word is the struct we are erasing.
        for (uint256 i = STRUCT_OFFSET_WORD + 0x20; i < STRUCT_OFFSET_WORD + 0x180; i++) {
            payload[i] = 0x00;
        }

        // Point the struct offset at the appended tail. Offsets are relative to params[0]'s data start,
        // which is exactly STRUCT_OFFSET_WORD.
        // abi.encode() of a dynamic struct prefixes its own 0x20 offset word, so the struct head begins one
        // word into the tail. Offsets are relative to params[0]'s data start, which is STRUCT_OFFSET_WORD.
        uint256 structStart = payload.length - smuggled.length + 0x20;
        _setWord(payload, STRUCT_OFFSET_WORD, structStart - STRUCT_OFFSET_WORD);

        // Sanity: the authenticated bytes really do not contain the amount that a successful smuggle spends.
        assertFalse(
            _contains(payload, abi.encodePacked(uint256(SMUGGLED_AMOUNT)), STRUCT_OFFSET_WORD, structStart),
            'the declared input must not contain the smuggled amountIn'
        );

        uint256 routerBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));
        uint256 recipientBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT);

        holder.attack(payload);

        assertFalse(holder.callSucceeded(), 'redirected struct offset must not execute');
        assertEq(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)),
            routerBefore,
            'no input may be spent from bytes outside the declared input'
        );
        assertEq(
            MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT),
            recipientBefore,
            'no output may be delivered from bytes outside the declared input'
        );
    }

    /// @notice The same redirect on the ordinary (non-nested) path, which has always been protected by
    ///         `poolManager.unlock()` re-encoding. Pins that the two paths now behave identically.
    function test_nonNestedPath_structOffsetRedirect_alsoCannotReachSmuggledBytes() public {
        bytes memory planBlob = _plan(SMUGGLED_AMOUNT);
        bytes memory smuggled = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,
                amountIn: SMUGGLED_AMOUNT,
                amountOutMinimum: 0,
                minHopPriceX36: 0,
                hookData: hex''
            })
        );

        bytes memory payload = _rawCalldata(planBlob, smuggled);
        _assertLayout(payload);

        for (uint256 i = STRUCT_OFFSET_WORD + 0x20; i < STRUCT_OFFSET_WORD + 0x180; i++) {
            payload[i] = 0x00;
        }
        // abi.encode() of a dynamic struct prefixes its own 0x20 offset word, so the struct head begins one
        // word into the tail. Offsets are relative to params[0]'s data start, which is STRUCT_OFFSET_WORD.
        uint256 structStart = payload.length - smuggled.length + 0x20;
        _setWord(payload, STRUCT_OFFSET_WORD, structStart - STRUCT_OFFSET_WORD);

        uint256 routerBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));

        (bool ok,) = address(router).call(payload);

        assertFalse(ok, 'redirected struct offset must not execute on the ordinary path either');
        assertEq(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)),
            routerBefore,
            'no funds may move on the ordinary path'
        );
    }

    /// @notice Only this contract may drive the nested action runner.
    function test_executeV4SwapWithinUnlock_revertsForExternalCallers() public {
        vm.expectRevert(abi.encodeWithSignature('NotSelf()'));
        router.executeV4SwapWithinUnlock(_plan(SMUGGLED_AMOUNT));
    }

    /// @dev needle search restricted to [from, to)
    function _contains(bytes memory haystack, bytes memory needle, uint256 from, uint256 to)
        internal
        pure
        returns (bool)
    {
        if (needle.length == 0 || to < needle.length) return false;
        for (uint256 i = from; i + needle.length <= to; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }
        return false;
    }
}
