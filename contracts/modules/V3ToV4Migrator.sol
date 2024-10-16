// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {MigratorImmutables} from '../modules/MigratorImmutables.sol';
import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {CalldataDecoder} from '@uniswap/v4-periphery/src/libraries/CalldataDecoder.sol';

/// @title V3 to V4 Migrator
/// @notice A contract that migrates liquidity from Uniswap V3 to V4
abstract contract V3ToV4Migrator is MigratorImmutables {
    using CalldataDecoder for bytes;

    error InvalidAction(bytes4 action);
    error OnlyMintAllowed();
    error NotAuthorizedForToken(uint256 tokenId);

    /// @dev the caller is authorized for the token if its the owner, spender, or operator
    function isAuthorizedForToken(address caller, uint256 tokenId) internal view returns (bool) {
        address owner = V3_POSITION_MANAGER.ownerOf(tokenId);
        return caller == owner || V3_POSITION_MANAGER.getApproved(tokenId) == caller
            || V3_POSITION_MANAGER.isApprovedForAll(owner, caller);
    }

    /// @dev validate if an action is decreaseLiquidity, collect, or burn
    function _checkValidV3Action(bytes4 selector) internal view {
        if (
            !(
                selector == INonfungiblePositionManager.decreaseLiquidity.selector
                    || selector == INonfungiblePositionManager.collect.selector
                    || selector == INonfungiblePositionManager.burn.selector
            )
        ) {
            revert InvalidAction(selector);
        }
    }

    function _checkV4PositionManagerCall(bytes calldata inputs) internal view {
        bytes4 selector;
        assembly {
            selector := calldataload(inputs.offset)
        }
        if (selector != V4_POSITION_MANAGER.modifyLiquidities.selector) {
            revert InvalidAction(selector);
        }

        bytes calldata slice = inputs[4:];
        // first bytes(0) extracts the unlockData parameter from modifyLiquidities
        // second bytes(0) extracts the actions parameter from unlockData
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
