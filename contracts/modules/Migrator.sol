// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';

abstract contract Migrator is MigratorImmutables {
    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
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

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view virtual returns (bool) {
        address owner = V3_POSITION_MANGER.ownerOf(tokenId);
        return (
            spender == owner || V3_POSITION_MANGER.getApproved(tokenId) == spender
                || V3_POSITION_MANGER.isApprovedForAll(owner, spender)
        );
    }
}
