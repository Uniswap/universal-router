// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {UniswapV2Library} from '../../contracts/modules/uniswap/v2/UniswapV2Library.sol';
import {V2SwapRouter} from '../../contracts/modules/uniswap/v2/V2SwapRouter.sol';
import {MockERC20} from './mock/MockERC20.sol';

/// @notice A v2 route measures delivery at the recipient. When the recipient is itself a pair the path passes
/// through, the tokens an earlier hop routed into it must not count toward amountOutMinimum, so the snapshot is
/// taken right before the final hop.
contract V2RecipientPairAliasTest is Test {
    IUniswapV2Factory constant FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    address constant USER = address(0xA11CE);
    uint256 constant LIQUIDITY = 1_000 ether;
    uint256 constant AMOUNT_IN = 10 ether;

    UniversalRouter router;
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockERC20 tokenC;
    MockERC20 tokenD;
    address pairBC;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 20010000);

        router = new UniversalRouter(
            RouterParameters({
                permit2: address(0),
                weth9: address(0),
                v2Factory: address(FACTORY),
                v3Factory: address(0),
                pairInitCodeHash: bytes32(0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f),
                poolInitCodeHash: bytes32(0),
                v4PoolManager: address(0),
                permissionsAdapterFactory: address(0),
                v3NFTPositionManager: address(0),
                v4PositionManager: address(0),
                spokePool: address(0)
            })
        );

        tokenA = new MockERC20();
        tokenB = new MockERC20();
        tokenC = new MockERC20();
        tokenD = new MockERC20();

        _seedPair(tokenA, tokenB);
        pairBC = _seedPair(tokenB, tokenC);
        _seedPair(tokenC, tokenD);
        _seedPair(tokenD, tokenB);

        // the router pays the first pair from its own balance (payerIsUser = false), so no Permit2 setup is needed
        tokenA.mint(address(router), AMOUNT_IN);
    }

    function _seedPair(MockERC20 a, MockERC20 b) internal returns (address pair) {
        pair = FACTORY.createPair(address(a), address(b));
        a.mint(pair, LIQUIDITY);
        b.mint(pair, LIQUIDITY);
        IUniswapV2Pair(pair).sync();
    }

    /// @dev A -> B -> C -> D -> B: the output token is also the first intermediate, so the B -> C hop deposits B
    /// into pairBC on the way through, before the final hop delivers there again
    function _route(address recipient, uint256 amountOutMinimum)
        internal
        view
        returns (bytes memory commands, bytes[] memory inputs)
    {
        address[] memory path = new address[](5);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);
        path[3] = address(tokenD);
        path[4] = address(tokenB);

        commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        inputs = new bytes[](1);
        inputs[0] = abi.encode(recipient, AMOUNT_IN, amountOutMinimum, path, false, new uint256[](0));
    }

    /// @dev every pair is used once and starts at LIQUIDITY on both sides
    function _quote() internal pure returns (uint256 intermediateB, uint256 finalB) {
        intermediateB = UniswapV2Library.getAmountOut(AMOUNT_IN, LIQUIDITY, LIQUIDITY);
        uint256 amountC = UniswapV2Library.getAmountOut(intermediateB, LIQUIDITY, LIQUIDITY);
        uint256 amountD = UniswapV2Library.getAmountOut(amountC, LIQUIDITY, LIQUIDITY);
        finalB = UniswapV2Library.getAmountOut(amountD, LIQUIDITY, LIQUIDITY);
    }

    function test_v2SwapExactIn_pairRecipientOnPath_finalHopBelowMinimum_reverts() public {
        (uint256 intermediateB, uint256 finalB) = _quote();
        // above what the final hop delivers, below what the pair's balance rises by over the whole route
        uint256 minimum = finalB + 1;
        assertLt(minimum, intermediateB + finalB);

        (bytes memory commands, bytes[] memory inputs) = _route(pairBC, minimum);
        vm.expectRevert(V2SwapRouter.V2TooLittleReceived.selector);
        router.execute(commands, inputs);
    }

    function test_v2SwapExactIn_pairRecipientOnPath_finalHopAtMinimum_succeeds() public {
        (uint256 intermediateB, uint256 finalB) = _quote();
        uint256 balanceBefore = tokenB.balanceOf(pairBC);

        (bytes memory commands, bytes[] memory inputs) = _route(pairBC, finalB);
        router.execute(commands, inputs);

        assertEq(tokenB.balanceOf(pairBC) - balanceBefore, intermediateB + finalB);
    }

    function test_v2SwapExactIn_ordinaryRecipient_receivesFinalHop() public {
        (, uint256 finalB) = _quote();

        (bytes memory commands, bytes[] memory inputs) = _route(USER, finalB);
        router.execute(commands, inputs);

        assertEq(tokenB.balanceOf(USER), finalB);
    }
}
