// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../libraries/UniswapPoolHelper.sol';
import '../libraries/UniswapV2Library.sol';
import '../libraries/Constants.sol';
import './Payments.sol';

contract V2SwapRouter {
    address internal immutable V2_FACTORY;
    bytes32 internal immutable PAIR_INIT_CODE_HASH;

    constructor(address v2Factory, bytes32 pairInitCodeHash) {
        V2_FACTORY = v2Factory;
        PAIR_INIT_CODE_HASH = pairInitCodeHash;
    }

    function _v2Swap(address[] memory path, address recipient) private {
        // cached to save on duplicate operations
        (address pair, address token0) =
            UniswapV2Library.pairAndToken0For(V2_FACTORY, PAIR_INIT_CODE_HASH, path[0], path[1]);
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (uint256 reserve0, uint256 reserve1,) = IUniswapV2Pair(pair).getReserves();
            (uint256 reserveInput, uint256 reserveOutput) =
                input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            uint256 amountInput = IERC20(input).balanceOf(pair) - reserveInput;
            uint256 amountOutput = UniswapV2Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
            address nextPair;
            (nextPair, token0) = i < path.length - 2
                ? UniswapV2Library.pairAndToken0For(V2_FACTORY, PAIR_INIT_CODE_HASH, output, path[i + 2])
                : (recipient, address(0));
            IUniswapV2Pair(pair).swap(amount0Out, amount1Out, nextPair, new bytes(0));
            pair = nextPair;
        }
    }

    function v2SwapExactInput(uint256 amountOutMin, address[] memory path, address recipient)
        internal
        returns (uint256 amountOut)
    {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(recipient);

        _v2Swap(path, recipient);

        amountOut = IERC20(path[path.length - 1]).balanceOf(recipient) - balanceBefore;
        require(amountOut >= amountOutMin, 'Too little received');
    }

    function v2SwapExactOutput(uint256 amountOut, uint256 amountInMax, address[] memory path, address recipient)
        internal
        returns (uint256 amountIn)
    {
        amountIn = UniswapV2Library.getAmountsIn(V2_FACTORY, PAIR_INIT_CODE_HASH, amountOut, path)[0];
        require(amountIn <= amountInMax, 'Too much requested');

        Payments.payERC20(path[0], UniswapV2Library.pairFor(V2_FACTORY, PAIR_INIT_CODE_HASH, path[0], path[1]), amountIn);

        _v2Swap(path, recipient);
    }
}
