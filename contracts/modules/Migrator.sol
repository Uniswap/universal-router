// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {TokenAuthorizationCache} from '../libraries/TokenAuthorizationCache.sol';

abstract contract Migrator is MigratorImmutables {
    using TokenAuthorizationCache for address;

    function erc721Permit(address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        V3_POSITION_MANGER.permit(spender, tokenId, deadline, v, r, s);
    }

    function isValidV3Action(bytes4 selector) internal pure returns (bool) {
        return selector == INonfungiblePositionManager.decreaseLiquidity.selector
            || selector == INonfungiblePositionManager.collect.selector
            || selector == INonfungiblePositionManager.burn.selector;
    }

    function isAuthorizedForToken(address caller, uint256 tokenId) internal returns (bool authorized) {
        if (caller.isAuthorizationCached(tokenId)) {
            return true;
        } else {
            address owner = V3_POSITION_MANGER.ownerOf(tokenId);
            authorized = caller == owner || V3_POSITION_MANGER.getApproved(tokenId) == caller
                || V3_POSITION_MANGER.isApprovedForAll(owner, caller);
            if (authorized) {
                caller.cacheAuthorization(tokenId);
            }
        }
    }
}
