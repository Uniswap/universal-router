// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {IERC20} from '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol';

abstract contract Migrator is MigratorImmutables {
    function erc721Permit(address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        V3_POSITION_MANGER.permit(spender, tokenId, deadline, v, r, s);
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory params) internal {
        V3_POSITION_MANGER.decreaseLiquidity(params);
    }

    function collect(INonfungiblePositionManager.CollectParams memory params) internal {
        V3_POSITION_MANGER.collect(params);
    }

    function burn(uint256 tokenId) internal {
        V3_POSITION_MANGER.burn(tokenId);
    }
}
