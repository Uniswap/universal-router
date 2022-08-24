// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract V2SwapRouter {
    function swapV2(uint256 amountIn, uint256 amountOutMin, address[] memory path, address recipient)
        internal
        returns (uint256 amountOut)
    {
      uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(recipient);
      for (uint256 i; i < path.length - 1; i++) {
          (address input, address output) = (path[i], path[i + 1]);
          (address token0, address token1) = input < output ? (input, output) : (output, input);
          IUniswapV2Pair pair = IUniswapV2Pair(getV2Pair(token0, token1));
          uint256 amountInput;
          uint256 amountOutput;
          // scope to avoid stack too deep errors
          {
              (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
              (uint256 reserveInput, uint256 reserveOutput) =
                  input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
              amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
              uint256 amountInWithFee = amountIn * 997;
              uint256 numerator = amountInWithFee * reserveOutput;
              uint256 denominator = reserveInput * 1000 + amountInWithFee;
              amountOutput = numerator / denominator;
          }
          (uint256 amount0Out, uint256 amount1Out) =
              input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
          address to = i < path.length - 2 ? getV2Pair(output, path[i + 2]) : recipient;
          pair.swap(amount0Out, amount1Out, to, new bytes(0));
          amountOut = IERC20(path[path.length - 1]).balanceOf(recipient) - balanceBefore;
          require(amountOut >= amountOutMin, 'Too little received');
      }
    }

    function getV2Pair(address token0, address token1) private pure returns (address) {
      return (
        address(
          uint160(
          uint256(
              keccak256(
                  abi.encodePacked(
                      hex'ff',
                      hex'5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f',
                      keccak256(abi.encodePacked(token0, token1)),
                      hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
                  )
              )
          ))
        )
      );
    }
  }
