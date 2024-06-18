// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {UniswapImmutables} from './UniswapImmutables.sol';

abstract contract Migrator is UniswapImmutables {

    function erc721Permit(uint256 tokenId, address spender, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override {
        INonfungiblePositionManager(UNISWAP_V3_NFT_POSITION_MANAGER).permit(spender, tokenId, deadline, v, r, s);
    }
}
