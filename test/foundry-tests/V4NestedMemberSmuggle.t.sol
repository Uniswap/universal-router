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
import {PathKey} from '@uniswap/v4-periphery/src/libraries/PathKey.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Permit2AllowanceMock} from './V4SwapWithinUnlock.t.sol';
import {RawLockHolder} from './V4NestedUnlockCalldataSmuggling.t.sol';

/// @notice Member-offset smuggling (finding BP-2): the ExactInputParams struct offset stays canonical at 0x20
///         while the *path* member offset is redirected to bytes appended past inputs[0].length. The escaping
///         member is the whole PathKey (intermediate currency, fee, tick spacing and the hooks address), so
///         this is the variant a struct-offset-only fix leaves live. The in-bounds path array is blanked,
///         so any swap that executes was routed through bytes outside the declared, signature-covered input.
contract V4NestedMemberSmuggleTest is Test, Deployers {
    UniversalRouter router;
    RawLockHolder holder;

    address constant RECIPIENT = address(0xBEEF);
    uint128 constant AMOUNT_IN = 1e15;

    // Byte offsets within executeNested(bytes,bytes[],uint256) calldata for a one-command / one-input plan whose
    // single action is SWAP_EXACT_IN with a 1-hop path (SETTLE + TAKE follow). Read off the calldata dump; the
    // ExactInputParams struct head sits one word past the params[0] struct-offset word.
    uint256 constant PARAMS0_LEN_WORD = 0x204; // value 0x1e0
    uint256 constant STRUCT_OFFSET_WORD = 0x224; // value 0x20 (stays canonical, which is the point of BP-2)
    uint256 constant STRUCT_HEAD = 0x244; // ExactInputParams word 0 (currencyIn); offsets are relative to here
    uint256 constant PATH_OFFSET_WORD = 0x264; // ExactInputParams word 1 (path); value 0xa0 -> blank + redirect
    uint256 constant PATH_ARRAY_START = 0x2e4; // in-bounds path array (length word)
    uint256 constant MINHOP_ARRAY_START = 0x3e4; // in-bounds minHopPriceX36 length word (blank up to here)

    function setUp() public {
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(0)), 3000, SQRT_PRICE_1_1);
        IAllowanceTransfer permit2 = IAllowanceTransfer(address(new Permit2AllowanceMock()));

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
        MockERC20(Currency.unwrap(currency0)).transfer(address(router), 10e18);
    }

    /// @dev A 1-hop exact-in currency0 -> currency1 plan (SWAP_EXACT_IN multi-hop form), settle from the
    ///      router balance, take output to RECIPIENT.
    function _plan() internal view returns (bytes memory) {
        PathKey[] memory path = new PathKey[](1);
        path[0] = PathKey({
            intermediateCurrency: currency1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)), hookData: hex''
        });
        IV4Router.ExactInputParams memory sp = IV4Router.ExactInputParams({
            currencyIn: currency0,
            path: path,
            minHopPriceX36: new uint256[](0),
            amountIn: AMOUNT_IN,
            amountOutMinimum: 0
        });
        Plan memory plan = Planner.init();
        plan = plan.add(Actions.SWAP_EXACT_IN, abi.encode(sp));
        plan = plan.add(Actions.SETTLE, abi.encode(currency0, ActionConstants.OPEN_DELTA, false));
        plan = plan.add(Actions.TAKE, abi.encode(currency1, RECIPIENT, ActionConstants.OPEN_DELTA));
        return plan.encode();
    }

    function _word(bytes memory blob, uint256 pos) internal pure returns (uint256 v) {
        assembly ('memory-safe') {
            v := mload(add(add(blob, 0x20), pos))
        }
    }

    function _setWord(bytes memory blob, uint256 pos, uint256 v) internal pure {
        assembly ('memory-safe') {
            mstore(add(add(blob, 0x20), pos), v)
        }
    }

    /// @dev Builds the smuggling payload and returns it. The declared path array is blanked in place; the real
    ///      1-hop path is appended past the encoding and the path member offset is redirected to it.
    function _buildSmugglePayload() internal view returns (bytes memory payload) {
        bytes memory planBlob = _plan();
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V4_SWAP)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = planBlob;

        // The smuggled path: the same encoding the declared path had, appended verbatim past the input end.
        PathKey[] memory smuggledPath = new PathKey[](1);
        smuggledPath[0] = PathKey({
            intermediateCurrency: currency1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)), hookData: hex''
        });
        bytes memory tail = abi.encode(smuggledPath);

        payload = bytes.concat(
            abi.encodeWithSignature('executeNested(bytes,bytes[],uint256)', commands, inputs, type(uint256).max), tail
        );

        // Guard the layout: struct offset canonical, path member offset at its known value, params length known.
        require(_word(payload, STRUCT_OFFSET_WORD) == 0x20, 'layout: struct offset moved');
        require(_word(payload, PATH_OFFSET_WORD) == 0xa0, 'layout: path member offset moved');
        require(_word(payload, PARAMS0_LEN_WORD) == 0x1e0, 'layout: params[0] length moved');

        // Blank the in-bounds path array so a canonical decode sees an empty path: any swap that runs must have
        // followed the redirected offset into the tail.
        for (uint256 i = PATH_ARRAY_START; i < MINHOP_ARRAY_START; i++) {
            payload[i] = 0x00;
        }

        // abi.encode(PathKey[]) prefixes a 0x20 offset word, so the array length word sits one word into the
        // tail. Point the path member offset (relative to STRUCT_HEAD) there. The struct offset itself is
        // untouched and still canonical.
        uint256 arrayLenWord = (payload.length - tail.length) + 0x20;
        _setWord(payload, PATH_OFFSET_WORD, arrayLenWord - STRUCT_HEAD);
    }

    /// @notice Security regression: passes on a build that blocks the member-offset smuggle, fails on one that
    ///         executes it. The abi.decode swap decoders bound every member offset against the input length, so
    ///         this passes with the nested branch decoding directly from its calldata slice. It was confirmed
    ///         to fail against the earlier assembly decoders, so it is a real exploit, not a vacuous assertion.
    function test_pathMemberRedirect_cannotReachSmuggledBytes() public {
        bytes memory payload = _buildSmugglePayload();

        uint256 routerBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));
        uint256 recipientBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT);

        holder.attack(payload);

        assertEq(
            MockERC20(Currency.unwrap(currency0)).balanceOf(address(router)),
            routerBefore,
            'no input may be spent via a path sourced past the declared input'
        );
        assertEq(
            MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT),
            recipientBefore,
            'no output may be delivered via a smuggled path'
        );
    }

    /// @notice Non-asserting: logs the actual outcome so the per-config behavior is visible from -vv even when
    ///         the asserting test above fails.
    function test_pathMemberRedirect_logOutcome() public {
        bytes memory payload = _buildSmugglePayload();
        uint256 routerBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));
        uint256 recipientBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT);

        holder.attack(payload);

        uint256 spent = routerBefore - MockERC20(Currency.unwrap(currency0)).balanceOf(address(router));
        uint256 delivered = MockERC20(Currency.unwrap(currency1)).balanceOf(RECIPIENT) - recipientBefore;
        emit log_named_uint('router call succeeded (1/0)', holder.callSucceeded() ? 1 : 0);
        emit log_named_uint('currency0 spent from router', spent);
        emit log_named_uint('currency1 delivered to recipient', delivered);
        if (spent > 0 || delivered > 0) {
            emit log_string('SMUGGLE EXECUTED: swap routed through bytes outside inputs[0].length');
        } else {
            emit log_string('SMUGGLE BLOCKED: redirected path member reached no executable route');
        }
    }
}
