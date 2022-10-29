// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import 'openzeppelin-contracts/contracts/token/ERC20/IERC20.sol';
import './UniswapV2Library.sol';
import '../../Payments.sol';
import '../../Permit2Payments.sol';

contract V2SwapRouter is Permit2Payments {
    address internal immutable V2_FACTORY;
    bytes32 internal immutable PAIR_INIT_CODE_HASH;

    error V2TooLittleReceived();
    error V2TooMuchRequested();

    constructor(address v2Factory, bytes32 pairInitCodeHash, address permit2) Permit2Payments(permit2) {
        V2_FACTORY = v2Factory;
        PAIR_INIT_CODE_HASH = pairInitCodeHash;
    }

    function _v2Swap(address[] memory path, address recipient) private {
        unchecked {
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
    }

    function v2SwapExactInput(uint256 amountOutMin, address[] memory path, address recipient) internal {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(recipient);

        _v2Swap(path, recipient);

        uint256 amountOut = IERC20(path[path.length - 1]).balanceOf(recipient) - balanceBefore;
        if (amountOut < amountOutMin) revert V2TooLittleReceived();
    }

    function v2SwapExactOutput(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory path,
        address recipient,
        address payer
    ) internal {
        (uint256 amountIn, address pair) =
            UniswapV2Library.getAmountInMultihop(V2_FACTORY, PAIR_INIT_CODE_HASH, amountOut, path);
        if (amountIn > amountInMax) revert V2TooMuchRequested();

        if (payer == address(this)) Payments.payERC20(path[0], pair, amountIn);
        else permit2TransferFrom(path[0], payer, pair, uint160(amountIn));
        _v2Swap(path, recipient);
    }
}
