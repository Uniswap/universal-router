// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../libraries/UniswapPoolHelper.sol';

contract V2SwapRouter {
    address immutable V2_Factory = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    bytes32 internal constant POOL_INIT_CODE_HASH_V2 =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    function _v2Swap(address[] memory path, address recipient) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, address token1) = UniswapPoolHelper.sortTokens(input, output);
            IUniswapV2Pair pair = IUniswapV2Pair(
                UniswapPoolHelper.computePoolAddress(
                    V2_Factory,
                    abi.encodePacked(token0, token1),
                    POOL_INIT_CODE_HASH_V2
                )
            );
            uint256 amountInput;
            uint256 amountOutput;
            (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
            (uint256 reserveInput, uint256 reserveOutput) = input == token0
                ? (reserve0, reserve1)
                : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
            amountOutput = UniswapPoolHelper.getAmountOut(amountInput, reserveInput, reserveOutput);
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2
                ? UniswapPoolHelper.computeV2Address(V2_Factory, output, path[i + 2])
                : recipient;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function v2SwapExactInput(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address recipient
    ) internal returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(recipient);

        _v2Swap(path, recipient);

        amountOut = IERC20(path[path.length - 1]).balanceOf(recipient) - balanceBefore;
        require(amountOut >= amountOutMin, 'Too little received');
    }
}
