// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import './UniswapPoolHelper.sol';

library UniswapV2Library {
    // calculates the CREATE2 address for a pair without making any external calls
    function pairAndToken0For(address factory, bytes32 initCodeHash, address tokenA, address tokenB)
        internal
        pure
        returns (address pair, address token0)
    {
        address token1;
        (token0, token1) = UniswapPoolHelper.sortTokens(tokenA, tokenB);
        return (pairForPreSorted(factory, initCodeHash, token0, token1), token0);
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, bytes32 initCodeHash, address tokenA, address tokenB)
        internal
        pure
        returns (address pair)
    {
        (address token0, address token1) = UniswapPoolHelper.sortTokens(tokenA, tokenB);
        return pairForPreSorted(factory, initCodeHash, token0, token1);
    }

    function pairForPreSorted(address factory, bytes32 initCodeHash, address token0, address token1)
        internal
        pure
        returns (address pair)
    {
        return UniswapPoolHelper.computePoolAddress(factory, abi.encodePacked(token0, token1), initCodeHash);
    }

    // fetches and sorts the reserves for a pair
    function getReserves(address factory, bytes32 initCodeHash, address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB, address pair)
    {
        (address token0, address token1) = UniswapPoolHelper.sortTokens(tokenA, tokenB);
        pair = pairForPreSorted(factory, initCodeHash, token0, token1);
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountOut)
    {
        require(reserveIn > 0 && reserveOut > 0);
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountIn)
    {
        require(reserveIn > 0 && reserveOut > 0);
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    // performs chained getAmountIn calculations on any number of pairs
    function getAmountInMultihop(address factory, bytes32 initCodeHash, uint256 amountOut, address[] memory path)
        internal
        view
        returns (uint256 amount, address pair)
    {
        require(path.length >= 2);
        amount = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            uint256 reserveIn;
            uint256 reserveOut;
            (reserveIn, reserveOut, pair) = getReserves(factory, initCodeHash, path[i - 1], path[i]);
            amount = getAmountIn(amount, reserveIn, reserveOut);
        }
    }
}
