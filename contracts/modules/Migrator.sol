// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {TokenAuthorized} from '../libraries/TokenAuthorized.sol';

abstract contract Migrator is MigratorImmutables {
    using TokenAuthorized for address;

    error NotAuthorized();

    modifier isAuthorizedForToken(uint256 tokenId) {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert NotAuthorized();
        _;
    }

    function erc721Permit(address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        V3_POSITION_MANGER.permit(spender, tokenId, deadline, v, r, s);
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory params)
        internal
        isAuthorizedForToken(params.tokenId)
    {
        V3_POSITION_MANGER.decreaseLiquidity(params);
    }

    function collect(INonfungiblePositionManager.CollectParams memory params)
        internal
        isAuthorizedForToken(params.tokenId)
    {
        V3_POSITION_MANGER.collect(params);
    }

    function burn(uint256 tokenId) internal isAuthorizedForToken(tokenId) {
        V3_POSITION_MANGER.burn(tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal returns (bool authorized) {
        if (spender.getAuthorized(tokenId)) {
            return true;
        } else {
            address owner = V3_POSITION_MANGER.ownerOf(tokenId);
            authorized = spender == owner || V3_POSITION_MANGER.getApproved(tokenId) == spender
                || V3_POSITION_MANGER.isApprovedForAll(owner, spender);
            if (authorized) {
                spender.setAuthorized(tokenId);
            }
            return authorized;
        }
    }
}
