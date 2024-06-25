// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {IERC20} from '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol';

abstract contract Migrator is MigratorImmutables {
    function erc721Permit(address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        V3POSITIONMANGER.permit(spender, tokenId, deadline, v, r, s);
    }

    function decreaseLiquidity(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) internal {
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: tokenId,
            liquidity: liquidity,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: deadline
        });

        V3POSITIONMANGER.decreaseLiquidity(params);
    }

    function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) internal {
        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: recipient,
            amount0Max: amount0Max,
            amount1Max: amount1Max
        });

        V3POSITIONMANGER.collect(params);
    }

    function burn(uint256 tokenId) internal {
        V3POSITIONMANGER.burn(tokenId);
    }

    function mint(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) internal {
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: recipient,
            deadline: deadline
        });

        IERC20(token0).approve(address(V3POSITIONMANGER), amount0Desired);
        IERC20(token1).approve(address(V3POSITIONMANGER), amount1Desired);

        V3POSITIONMANGER.mint(params);
    }

    function increaseLiquidity(address token0, address token1, uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) internal {
        INonfungiblePositionManager.IncreaseLiquidityParams memory params = INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: tokenId,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: deadline
        });

        IERC20(token0).approve(address(V3POSITIONMANGER), amount0Desired);
        IERC20(token1).approve(address(V3POSITIONMANGER), amount1Desired);

        V3POSITIONMANGER.increaseLiquidity(params);
    }
}
