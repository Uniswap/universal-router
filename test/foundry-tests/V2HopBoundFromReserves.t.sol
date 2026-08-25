// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {V2SwapRouter} from '../../contracts/modules/uniswap/v2/V2SwapRouter.sol';
import {UniswapV2Library} from '../../contracts/modules/uniswap/v2/UniswapV2Library.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockV2Pair, MockV2Factory} from './mock/MockV2Pair.sol';

/// @notice Multihop counterpart to V2PerHopDonationPoC.
///
/// The single-hop PoC shows a donation to the swapped pair inflating that hop's price denominator.
/// This file covers the case that decides whether input attribution can fix the finding: a donation
/// to pair 0 of a two-hop route, with hop 0's bound DISABLED and only hop 1's bound set.
///
/// Hop 0 swaps the donation, so the proceeds physically arrive at pair 1. Hop 1 therefore receives
/// genuinely more input and honestly measures a worse rate. No attribution scheme can recover the
/// victim's share of what reached pair 1, because the tokens came out of the route's own swap.
contract V2HopBoundFromReservesTest is Test {
    uint256 constant R0_A = 10_000 ether; // pair0 reserves, A side
    uint256 constant R0_B = 10_000 ether; // pair0 reserves, B side
    uint256 constant R1_B = 10_000 ether; // pair1 reserves, B side
    uint256 constant R1_C = 20_000 ether; // pair1 reserves, C side

    uint256 constant SWAP_IN = 10 ether;
    uint256 constant TOLERANCE_BPS = 50; // 0.50% per-hop tolerance

    address constant VICTIM = address(0x1C71);
    address constant ATTACKER = address(0xA77ACC);
    address constant RECIPIENT = address(0xBEEF);

    UniversalRouter router;
    MockV2Factory factory;
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockERC20 tokenC;
    MockV2Pair pair0; // A/B
    MockV2Pair pair1; // B/C

    function setUp() public {
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        tokenC = new MockERC20();

        factory = new MockV2Factory();
        pair0 = MockV2Pair(factory.createPair(address(tokenA), address(tokenB)));
        pair1 = MockV2Pair(factory.createPair(address(tokenB), address(tokenC)));

        tokenA.mint(address(pair0), R0_A);
        tokenB.mint(address(pair0), R0_B);
        pair0.sync();

        tokenB.mint(address(pair1), R1_B);
        tokenC.mint(address(pair1), R1_C);
        pair1.sync();

        RouterParameters memory params = RouterParameters({
            permit2: address(0xdead),
            weth9: address(0),
            v2Factory: address(factory),
            v3Factory: address(0),
            pairInitCodeHash: factory.pairInitCodeHash(),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
    }

    // ------------------------------------------------------------------
    // Route execution
    // ------------------------------------------------------------------

    function _path() internal view returns (address[] memory path) {
        path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);
    }

    function _trySwap(uint256 amountIn, uint256[] memory hopBounds) internal returns (bool ok, bytes memory ret) {
        tokenA.mint(address(router), amountIn);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, amountIn, uint256(0), _path(), false, hopBounds);

        vm.prank(VICTIM);
        (ok, ret) = address(router).call(abi.encodeWithSignature('execute(bytes,bytes[])', commands, inputs));
    }

    // ------------------------------------------------------------------
    // Helpers mirroring the router's on-chain math
    // ------------------------------------------------------------------

    /// @dev Reserves ordered as (reserveIn, reserveOut) for a directional hop
    function _reserves(MockV2Pair p, address input) internal view returns (uint256 rIn, uint256 rOut) {
        (uint112 r0, uint112 r1,) = p.getReserves();
        (rIn, rOut) = input == p.token0() ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    /// @dev What hop 1 measures as its input/output when `donation` sits at pair 0 beforehand
    function _hop1Measured(uint256 donation) internal view returns (uint256 hop1In, uint256 hop1Out) {
        (uint256 r0In, uint256 r0Out) = _reserves(pair0, address(tokenA));
        (uint256 r1In, uint256 r1Out) = _reserves(pair1, address(tokenB));
        hop1In = UniswapV2Library.getAmountOut(SWAP_IN + donation, r0In, r0Out);
        hop1Out = UniswapV2Library.getAmountOut(hop1In, r1In, r1Out);
    }

    function _hop1Price(uint256 donation) internal view returns (uint256) {
        (uint256 hop1In, uint256 hop1Out) = _hop1Measured(donation);
        return hop1Out * Constants.PRICE_PRECISION / hop1In;
    }

    /// @dev The hop-1 ratio bound an honest router would compute from a clean quote
    function _honestHop1Bound() internal view returns (uint256) {
        return _hop1Price(0) * (10_000 - TOLERANCE_BPS) / 10_000;
    }

    function _minimalCensoringDonation(uint256 minPrice) internal view returns (uint256) {
        uint256 lo = 0;
        uint256 hi = R0_A;
        require(_hop1Price(hi) < minPrice, 'no donation can censor at these params');
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_hop1Price(mid) < minPrice) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    // ------------------------------------------------------------------
    // Baseline
    // ------------------------------------------------------------------

    function test_baseline_boundedMultihopRouteSucceeds() public {
        (bool ok, bytes memory ret) = _trySwap(SWAP_IN, _reserveBounds());
        if (!ok) emit log_named_bytes('revert data', ret);
        assertTrue(ok, 'honest bounded route should succeed');
        assertGt(tokenC.balanceOf(RECIPIENT), 0, 'victim received nothing');
    }

    // ------------------------------------------------------------------
    // Why attribution cannot fix this: hop 1 is what trips, and it trips honestly
    //
    // These model the superseded rule (measured output / measured input) using the router's own
    // library math. For a live demonstration against the unfixed contract, run
    // test_donationToPair0_cannotCensorRoute at this branch's merge-base -- it reverts there with
    // V2TooLittleReceivedPerHop(hopIndex = 1) even with hop 0's bound set to 0.
    // ------------------------------------------------------------------

    /// @dev A donation to pair 0 pushes hop 1's measured ratio under an honest floor
    function test_donationWouldDefeatTheMeasuredRatioAtHop1() public {
        uint256 honestBound = _honestHop1Bound();
        uint256 donation = _minimalCensoringDonation(honestBound);

        emit log_named_decimal_uint('victim input                ', SWAP_IN, 18);
        emit log_named_decimal_uint('minimal donation to pair 0  ', donation, 18);
        emit log_named_uint('  as bps of pair0 input reserve', donation * 10_000 / R0_A);
        emit log_named_uint('hop1 honest floor (ratio)   ', honestBound);
        emit log_named_uint('hop1 measured ratio w/ donation', _hop1Price(donation));

        assertLt(_hop1Price(donation), honestBound, 'donation should defeat a measured per-hop ratio');
    }

    /// @dev ...and it does so by increasing what the route itself delivers to pair 1, so no
    /// attribution of the victim's share can undo it -- those tokens came out of hop 0's own swap.
    function test_donationIncreasesFlowThroughPair1() public {
        uint256 donation = _minimalCensoringDonation(_honestHop1Bound());
        (uint256 honestHop1In,) = _hop1Measured(0);
        (uint256 attackedHop1In,) = _hop1Measured(donation);

        emit log_named_decimal_uint('B reaching pair1, honest  ', honestHop1In, 18);
        emit log_named_decimal_uint('B reaching pair1, attacked', attackedHop1In, 18);

        assertGt(attackedHop1In, honestHop1In, 'donation should increase input reaching pair 1');
    }

    /// @dev The donation remains unsynced excess, so it is fully recoverable after the revert
    function test_donationIsRecoverableViaSkim() public {
        uint256 donation = _minimalCensoringDonation(_honestHop1Bound());
        tokenA.mint(ATTACKER, donation);
        uint256 attackerStart = tokenA.balanceOf(ATTACKER);

        vm.prank(ATTACKER);
        tokenA.transfer(address(pair0), donation);

        pair0.skim(ATTACKER);
        assertEq(tokenA.balanceOf(ATTACKER), attackerStart, 'attacker did not fully recover donation');
    }

    // ------------------------------------------------------------------
    // Reserve-derived bounds: each entry packs (referenceInput, minAmountOut)
    // ------------------------------------------------------------------

    function _packBound(uint256 refIn, uint256 minOut) internal pure returns (uint256) {
        return (refIn << 128) | minOut;
    }

    /// @dev Bounds a router would emit from a clean quote: reference input per hop is that hop's
    /// quoted input, and the floor is that hop's quoted output less tolerance.
    function _reserveBounds() internal view returns (uint256[] memory a) {
        (uint256 r0In, uint256 r0Out) = _reserves(pair0, address(tokenA));
        (uint256 r1In, uint256 r1Out) = _reserves(pair1, address(tokenB));

        uint256 quoted0 = UniswapV2Library.getAmountOut(SWAP_IN, r0In, r0Out);
        uint256 quoted1 = UniswapV2Library.getAmountOut(quoted0, r1In, r1Out);

        a = new uint256[](2);
        a[0] = _packBound(SWAP_IN, quoted0 * (10_000 - TOLERANCE_BPS) / 10_000);
        a[1] = _packBound(quoted0, quoted1 * (10_000 - TOLERANCE_BPS) / 10_000);
    }

    /// @dev Moves pair1's reserves against the victim: buys C with B, worsening the B->C rate
    function _sandwichPair1(uint256 amountIn) internal {
        tokenB.mint(ATTACKER, amountIn);
        vm.prank(ATTACKER);
        tokenB.transfer(address(pair1), amountIn);

        (uint256 rIn, uint256 rOut) = _reserves(pair1, address(tokenB));
        uint256 out = UniswapV2Library.getAmountOut(amountIn, rIn, rOut);
        (uint256 a0, uint256 a1) = address(tokenC) == pair1.token0() ? (out, uint256(0)) : (uint256(0), out);

        vm.prank(ATTACKER);
        pair1.swap(a0, a1, ATTACKER, '');
    }

    /// @notice The donation must no longer be able to censor the route, because the bound is
    /// evaluated against reserves at a reference input rather than against measured flow.
    function test_donationToPair0_cannotCensorRoute() public {
        uint256[] memory bounds = _reserveBounds();
        uint256 donation = _minimalCensoringDonation(_honestHop1Bound());

        tokenA.mint(ATTACKER, donation);
        vm.prank(ATTACKER);
        tokenA.transfer(address(pair0), donation);

        (bool ok, bytes memory ret) = _trySwap(SWAP_IN, bounds);
        if (!ok) emit log_named_bytes('revert data', ret);
        assertTrue(ok, 'donation must not censor a reserve-derived bound');

        // the donation is swapped through the route, so the victim ends up strictly better off
        (, uint256 honestOut) = _hop1Measured(0);
        assertGt(tokenC.balanceOf(RECIPIENT), honestOut, 'victim should receive more than the honest quote');
    }

    /// @notice Single-hop coverage, mirroring V2PerHopDonationPoC under the reserve-derived rule.
    function test_singleHop_donationCannotCensorRoute() public {
        (uint256 r0In, uint256 r0Out) = _reserves(pair0, address(tokenA));
        uint256 quoted = UniswapV2Library.getAmountOut(SWAP_IN, r0In, r0Out);
        uint256[] memory bounds = new uint256[](1);
        bounds[0] = _packBound(SWAP_IN, quoted * (10_000 - TOLERANCE_BPS) / 10_000);

        // far beyond what the superseded measured ratio needed to censor this trade
        uint256 donation = 5_000 ether;
        tokenA.mint(ATTACKER, donation);
        vm.prank(ATTACKER);
        tokenA.transfer(address(pair0), donation);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        tokenA.mint(address(router), SWAP_IN);
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, SWAP_IN, uint256(0), path, false, bounds);

        vm.prank(VICTIM);
        (bool ok, bytes memory ret) =
            address(router).call(abi.encodeWithSignature('execute(bytes,bytes[])', commands, inputs));
        if (!ok) emit log_named_bytes('revert data', ret);
        assertTrue(ok, 'single-hop donation must not censor a reserve-derived bound');
        assertGt(tokenB.balanceOf(RECIPIENT), quoted, 'victim should receive more than the honest quote');
    }

    /// @notice A genuine sandwich moves reserves, so it must still be caught.
    function test_sandwichOnPair1_stillReverts() public {
        uint256[] memory bounds = _reserveBounds();

        _sandwichPair1(300 ether);

        (bool ok, bytes memory ret) = _trySwap(SWAP_IN, bounds);
        assertFalse(ok, 'sandwich on pair1 must still trip the hop bound');
        assertEq(bytes4(ret), V2SwapRouter.V2TooLittleReceivedPerHop.selector, 'wrong revert');

        (uint256 hopIndex, uint256 minOut, uint256 quoted) =
            abi.decode(_stripSelector(ret), (uint256, uint256, uint256));
        assertEq(hopIndex, 1, 'hop 1 is the sandwiched pool');

        // the reported figure must be the reserve-derived quote, not a price ratio
        (uint256 r1In, uint256 r1Out) = _reserves(pair1, address(tokenB));
        (uint256 r0In, uint256 r0Out) = _reserves(pair0, address(tokenA));
        uint256 refIn1 = UniswapV2Library.getAmountOut(SWAP_IN, r0In, r0Out);
        assertEq(quoted, UniswapV2Library.getAmountOut(refIn1, r1In, r1Out), 'quoted should be reserve-derived');
        assertLt(quoted, minOut, 'quote should sit below the floor');
    }

    /// @notice Bounds must still be honoured when the router cannot know the input amount.
    function test_alreadyPaidMode_keepsHopBounds() public {
        uint256[] memory bounds = _reserveBounds();

        // pay the first pair directly, then signal ALREADY_PAID
        tokenA.mint(address(pair0), SWAP_IN);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, Constants.ALREADY_PAID, uint256(0), _path(), false, bounds);

        vm.prank(VICTIM);
        (bool ok, bytes memory ret) =
            address(router).call(abi.encodeWithSignature('execute(bytes,bytes[])', commands, inputs));
        if (!ok) emit log_named_bytes('revert data', ret);
        assertTrue(ok, 'ALREADY_PAID route with hop bounds should execute');
        assertGt(tokenC.balanceOf(RECIPIENT), 0, 'victim received nothing');
    }

    function _stripSelector(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i; i < out.length; i++) {
            out[i] = data[i + 4];
        }
    }
}
