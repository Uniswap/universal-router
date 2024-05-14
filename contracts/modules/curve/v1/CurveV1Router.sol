// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {Constants} from '../../../libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

interface ICurveV1Pool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external;
    function coins(uint256 i) external view returns (address);
}

// error EmbededError(uint256 errorCode);

/// @title Router for Curve v1 Trades
abstract contract CurveV1Router {

    /// @notice Performs a Curve v1 exact input exchange
    /// @param curveV1PoolAddress The recipient of the output tokens
    /// @param inputTokenAddress The address of input token
    /// @param outputTokenAddress The address of output token
    /// @param amountIn The amount of input tokens to exchange
    /// @param amountOutMinimum The minimum desired amount of output tokens=
    function curveV1Exchange(
        address curveV1PoolAddress,
        address inputTokenAddress,
        address outputTokenAddress,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal {
        ICurveV1Pool pool = ICurveV1Pool(curveV1PoolAddress);
        int128 i = -1;
        int128 j = -1;
        for (uint256 k; k < 10; k++) {
            address tokenAddress = pool.coins(k);
            if (tokenAddress == inputTokenAddress) {
                i = int128(int256(k));
            }
            if (tokenAddress == outputTokenAddress) {
                j = int128(int256(k));
            }
            if (i >= 0 && j >= 0) {
                break;
            }
        }

        if (amountIn == Constants.CONTRACT_BALANCE) {
            amountIn = ERC20(inputTokenAddress).balanceOf(address(this));
        }

        uint256 allowance = ERC20(inputTokenAddress).allowance(address(this), curveV1PoolAddress);
        if (allowance <= amountIn) {
            ERC20(inputTokenAddress).approve(curveV1PoolAddress, type(uint256).max);
        }

        pool.exchange(i, j, amountIn, amountOutMinimum);
        // revert EmbededError(amountOutMinimum);
    }
}
