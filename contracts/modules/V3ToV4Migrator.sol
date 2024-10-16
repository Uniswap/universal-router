// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {IERC721Permit} from '@uniswap/v3-periphery/contracts/interfaces/IERC721Permit.sol';

/// @title V3 to V4 Migrator
/// @notice A contract that migrates liquidity from Uniswap V3 to V4
abstract contract V3ToV4Migrator is MigratorImmutables {
    error InvalidAction(bytes4 action);
    error NotAuthorizedForToken(uint256 tokenId);

    /// @dev validate if an action is decreaseLiquidity, collect, or burn
    function _isValidAction(bytes4 selector) private pure returns (bool) {
        return selector == INonfungiblePositionManager.decreaseLiquidity.selector
            || selector == INonfungiblePositionManager.collect.selector
            || selector == INonfungiblePositionManager.burn.selector;
    }

    /// @dev the caller is authorized for the token if its the owner, spender, or operator
    function _isAuthorizedForToken(address caller, uint256 tokenId) private view returns (bool) {
        address owner = V3_POSITION_MANAGER.ownerOf(tokenId);
        return caller == owner || V3_POSITION_MANAGER.getApproved(tokenId) == caller
            || V3_POSITION_MANAGER.isApprovedForAll(owner, caller);
    }

    /// @dev check that a call is to the ERC721 permit function
    function _checkV3PermitCall(bytes calldata inputs) internal pure {
        bytes4 selector;
        assembly {
            selector := calldataload(inputs.offset)
        }

        if (selector != IERC721Permit.permit.selector) {
            revert InvalidAction(selector);
        }
    }

    /// @dev check that the v3 position manager call is a safe call
    function _checkV3PositionManagerCall(bytes calldata inputs, address caller) internal view {
        bytes4 selector;
        assembly {
            selector := calldataload(inputs.offset)
        }

        if (!_isValidAction(selector)) {
            revert InvalidAction(selector);
        }

        uint256 tokenId;
        assembly {
            // tokenId is always the first parameter in the valid actions
            tokenId := calldataload(add(inputs.offset, 0x04))
        }
        // If any other address that is not the owner wants to call this function, it also needs to be approved (in addition to this contract)
        // This can be done in 2 ways:
        //    1. This contract is permitted for the specific token and the caller is approved for ALL of the owner's tokens
        //    2. This contract is permitted for ALL of the owner's tokens and the caller is permitted for the specific token
        if (!_isAuthorizedForToken(caller, tokenId)) {
            revert NotAuthorizedForToken(tokenId);
        }
    }
}
