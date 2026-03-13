// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {V3SwapRouter} from '../../contracts/modules/uniswap/v3/V3SwapRouter.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockV3Pool} from './mock/MockV3Pool.sol';

contract UniswapV3Test is Test {
    // 90% exchange rate: input 100 → output 90
    uint256 constant RATE = 0.9e18;
    uint256 constant PRECISION = 1e36;
    uint24 constant FEE = 3000;

    address constant V3_FACTORY = address(0xBEEF);
    bytes32 constant POOL_INIT_CODE_HASH = bytes32(uint256(0xDEAD));
    address constant RECIPIENT = address(0x1234);

    UniversalRouter router;
    MockERC20 tokenA; // lowest address
    MockERC20 tokenB;
    MockERC20 tokenC; // highest address

    function setUp() public {
        // Deploy tokens and sort by address
        address[3] memory tokens;
        for (uint256 i = 0; i < 3; i++) {
            tokens[i] = address(new MockERC20());
        }
        if (tokens[0] > tokens[1]) (tokens[0], tokens[1]) = (tokens[1], tokens[0]);
        if (tokens[1] > tokens[2]) (tokens[1], tokens[2]) = (tokens[2], tokens[1]);
        if (tokens[0] > tokens[1]) (tokens[0], tokens[1]) = (tokens[1], tokens[0]);
        tokenA = MockERC20(tokens[0]);
        tokenB = MockERC20(tokens[1]);
        tokenC = MockERC20(tokens[2]);

        // Deploy router
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: V3_FACTORY,
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: POOL_INIT_CODE_HASH,
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);

        // Deploy mock pools at deterministic addresses
        _deployMockPool(address(tokenA), address(tokenB));
        _deployMockPool(address(tokenB), address(tokenC));
    }

    // ──────────────────────────────────────────────
    // Exact Input - Single Hop
    // ──────────────────────────────────────────────

    function testV3ExactInputSingleHopNoSlippage() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB));
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, new uint256[](0));

        assertEq(tokenB.balanceOf(RECIPIENT), 90 ether);
    }

    function testV3ExactInputSingleHopSlippagePass() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB));
        uint256[] memory slippage = new uint256[](1);
        slippage[0] = 0.8e36; // 80% threshold, actual is 90%
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);

        assertEq(tokenB.balanceOf(RECIPIENT), 90 ether);
    }

    function testV3ExactInputSingleHopSlippageFail() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB));
        uint256[] memory slippage = new uint256[](1);
        slippage[0] = 0.95e36; // 95% threshold, actual is 90%

        vm.expectRevert();
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);
    }

    // ──────────────────────────────────────────────
    // Exact Input - Multi Hop
    // ──────────────────────────────────────────────

    function testV3ExactInputMultiHopSlippagePass() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB), FEE, address(tokenC));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.8e36; // hop 0: A→B
        slippage[1] = 0.8e36; // hop 1: B→C
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);

        assertEq(tokenC.balanceOf(RECIPIENT), 81 ether);
    }

    function testV3ExactInputMultiHopSlippageFailFirstHop() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB), FEE, address(tokenC));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.95e36; // hop 0 too tight
        slippage[1] = 0.8e36;

        vm.expectRevert();
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);
    }

    function testV3ExactInputMultiHopSlippageFailSecondHop() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB), FEE, address(tokenC));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.8e36;
        slippage[1] = 0.95e36; // hop 1 too tight

        vm.expectRevert();
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);
    }

    // ──────────────────────────────────────────────
    // Exact Output - Single Hop
    // ──────────────────────────────────────────────

    function testV3ExactOutputSingleHopSlippagePass() public {
        deal(address(tokenA), address(router), 200 ether);

        // Exact output path is reversed: B → A (to trade A→B)
        bytes memory path = abi.encodePacked(address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](1);
        slippage[0] = 0.8e36; // 80% threshold, actual is 90%
        _executeV3ExactOut(RECIPIENT, 90 ether, type(uint256).max, path, slippage);

        assertEq(tokenB.balanceOf(RECIPIENT), 90 ether);
    }

    function testV3ExactOutputSingleHopSlippageFail() public {
        deal(address(tokenA), address(router), 200 ether);

        bytes memory path = abi.encodePacked(address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](1);
        slippage[0] = 0.95e36; // 95% threshold, actual is 90%

        vm.expectRevert();
        _executeV3ExactOut(RECIPIENT, 90 ether, type(uint256).max, path, slippage);
    }

    // ──────────────────────────────────────────────
    // Exact Output - Multi Hop (the bug-catching tests)
    // ──────────────────────────────────────────────

    function testV3ExactOutputMultiHopSlippagePass() public {
        deal(address(tokenA), address(router), 200 ether);

        // Trade A→B→C, exact output 81 C. Path reversed: C-B-A
        bytes memory path = abi.encodePacked(address(tokenC), FEE, address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.8e36; // hop 0: A→B
        slippage[1] = 0.8e36; // hop 1: B→C
        _executeV3ExactOut(RECIPIENT, 81 ether, type(uint256).max, path, slippage);

        assertEq(tokenC.balanceOf(RECIPIENT), 81 ether);
    }

    /// @notice This test catches the bug where hop 0 slippage was skipped in exact-output.
    /// Hop 0 (A→B) is the first trading hop but the last executed in exact-output.
    /// With the bug, maxHopSlippage[0] was never checked.
    function testV3ExactOutputMultiHopSlippageFailHop0() public {
        deal(address(tokenA), address(router), 200 ether);

        bytes memory path = abi.encodePacked(address(tokenC), FEE, address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.95e36; // hop 0 (A→B) too tight - this MUST be enforced
        slippage[1] = 0.8e36; // hop 1 (B→C) fine

        vm.expectRevert();
        _executeV3ExactOut(RECIPIENT, 81 ether, type(uint256).max, path, slippage);
    }

    function testV3ExactOutputMultiHopSlippageFailHop1() public {
        deal(address(tokenA), address(router), 200 ether);

        bytes memory path = abi.encodePacked(address(tokenC), FEE, address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](2);
        slippage[0] = 0.8e36; // hop 0 fine
        slippage[1] = 0.95e36; // hop 1 (B→C) too tight

        vm.expectRevert();
        _executeV3ExactOut(RECIPIENT, 81 ether, type(uint256).max, path, slippage);
    }

    // ──────────────────────────────────────────────
    // Invalid hop slippage length
    // ──────────────────────────────────────────────

    function testV3ExactInputInvalidHopSlippageLength() public {
        deal(address(tokenA), address(router), 100 ether);

        bytes memory path = abi.encodePacked(address(tokenA), FEE, address(tokenB));
        uint256[] memory slippage = new uint256[](2); // wrong: 1 hop but 2 values

        vm.expectRevert(V3SwapRouter.V3HopSlippageAndPathLengthMismatch.selector);
        _executeV3ExactIn(RECIPIENT, 100 ether, 0, path, slippage);
    }

    function testV3ExactOutputInvalidHopSlippageLength() public {
        deal(address(tokenA), address(router), 200 ether);

        bytes memory path = abi.encodePacked(address(tokenB), FEE, address(tokenA));
        uint256[] memory slippage = new uint256[](2); // wrong: 1 hop but 2 values

        vm.expectRevert(V3SwapRouter.V3HopSlippageAndPathLengthMismatch.selector);
        _executeV3ExactOut(RECIPIENT, 90 ether, type(uint256).max, path, slippage);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _executeV3ExactIn(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes memory path,
        uint256[] memory maxHopSlippage
    ) internal {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V3_SWAP_EXACT_IN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(recipient, amountIn, amountOutMin, path, false, maxHopSlippage);
        router.execute(commands, inputs);
    }

    function _executeV3ExactOut(
        address recipient,
        uint256 amountOut,
        uint256 amountInMax,
        bytes memory path,
        uint256[] memory maxHopSlippage
    ) internal {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V3_SWAP_EXACT_OUT)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(recipient, amountOut, amountInMax, path, false, maxHopSlippage);
        router.execute(commands, inputs);
    }

    function _deployMockPool(address token0, address token1) internal {
        MockV3Pool mock = new MockV3Pool(token0, token1, RATE);
        address expected = _computePoolAddress(token0, token1, FEE);
        vm.etch(expected, address(mock).code);
        // Give pool tokens to transfer during swaps
        deal(token0, expected, 10000 ether);
        deal(token1, expected, 10000 ether);
    }

    function _computePoolAddress(address _tokenA, address _tokenB, uint24 fee) internal pure returns (address) {
        if (_tokenA > _tokenB) (_tokenA, _tokenB) = (_tokenB, _tokenA);
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff', V3_FACTORY, keccak256(abi.encode(_tokenA, _tokenB, fee)), POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );
    }
}
