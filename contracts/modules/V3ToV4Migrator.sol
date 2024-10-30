// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {IERC721Permit} from '@uniswap/v3-periphery/contracts/interfaces/IERC721Permit.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';

/// @title V3 to V4 Migrator
/// @notice A contract that migrates liquidity from Uniswap V3 to V4
abstract contract V3ToV4Migrator is MigratorImmutables {
    using CalldataDecoder for bytes;

    error InvalidAction(bytes4 action);
    error OnlyMintAllowed();
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

    /// @dev check that the v4 position manager call is a safe call
    /// of the position-altering Actions, we only allow Actions.MINT
    /// this is because, if a user could be tricked into approving the UniversalRouter for
    /// their position, an attacker could take their fees, or drain their entire position
    function _checkV4PositionManagerCall(bytes calldata inputs) internal view {
        bytes4 selector;
        assembly {
            selector := calldataload(inputs.offset)
        }
        if (selector != V4_POSITION_MANAGER.modifyLiquidities.selector) {
            revert InvalidAction(selector);
        }

        // slice is `abi.encode(bytes unlockData, uint256 deadline)`
        bytes calldata slice = inputs[4:];
        // the first bytes(0) extracts the unlockData parameter from modifyLiquidities
        // unlockData = `abi.encode(bytes actions, bytes[] params)`
        // the second bytes(0) extracts the actions parameter from unlockData
        bytes calldata actions = slice.toBytes(0).toBytes(0);

        uint256 numActions = actions.length;

        for (uint256 actionIndex = 0; actionIndex < numActions; actionIndex++) {
            uint256 action = uint8(actions[actionIndex]);

            if (
                action == Actions.INCREASE_LIQUIDITY || action == Actions.DECREASE_LIQUIDITY
                    || action == Actions.BURN_POSITION
            ) {
                revert OnlyMintAllowed();
            }
        }
    }
}
