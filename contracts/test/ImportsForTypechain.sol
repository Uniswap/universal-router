// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {PositionManager} from '@uniswap/v4-periphery/src/PositionManager.sol';
import {PoolManager} from '@uniswap/v4-core/src/PoolManager.sol';
import {ERC721} from 'solmate/src/tokens/ERC721.sol';
import {ERC6909} from '@uniswap/v4-core/src/ERC6909.sol';

// this contract only exists to pull PositionManager and PoolManager into the hardhat build pipeline
// so that typechain artifacts are generated for it
abstract contract ImportsForTypechain is PositionManager, PoolManager {
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC6909, ERC721) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
