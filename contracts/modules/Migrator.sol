// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';

abstract contract Migrator is MigratorImmutables {
    function erc721Permit(address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        V3_POSITION_MANGER.permit(spender, tokenId, deadline, v, r, s);
    }

    function isValidV3Action(bytes4 selector) internal pure returns (bool) {
        return selector == bytes4(keccak256('decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))'))
            || selector == bytes4(keccak256('collect((uint256,address,uint128,uint128))'))
            || selector == bytes4(keccak256('burn(uint256)'));
    }

    function isAuthorizedForToken(address spender, uint256 tokenId) internal view returns (bool authorized) {
        address owner = V3_POSITION_MANGER.ownerOf(tokenId);
        return spender == owner || V3_POSITION_MANGER.getApproved(tokenId) == spender
            || V3_POSITION_MANGER.isApprovedForAll(owner, spender);
    }
}
