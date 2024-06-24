// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';

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
}
