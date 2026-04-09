// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {UniswapImmutables} from '../UniswapImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {V4Router} from '@uniswap/v4-periphery/src/V4Router.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {IPermissionsAdapterFactory} from '@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapterFactory.sol';
import {IPermissionsAdapter} from '@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol';
import {PermissionFlags} from '@uniswap/v4-periphery/src/hooks/permissionedPools/libraries/PermissionFlags.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';

/// @title Router for Uniswap v4 Trades
abstract contract V4SwapRouter is V4Router, Permit2Payments {

    // @dev The factory for permissions adapters
    IPermissionsAdapterFactory public immutable PERMISSIONS_ADAPTER_FACTORY;

    // @dev Thrown when a user is not authorized to perform an action
    error Unauthorized();

    constructor(address _poolManager, address _permissionsAdapterFactory) V4Router(IPoolManager(_poolManager)) {
        PERMISSIONS_ADAPTER_FACTORY = IPermissionsAdapterFactory(_permissionsAdapterFactory);
    }

    function _pay(Currency currency, address payer, uint256 amount) internal override {
        // If permissions adapter factory exists, fetch the verified permissions adapter if it exists.
        address permissionedToken = address(PERMISSIONS_ADAPTER_FACTORY) == address(0)
            ? address(0)
            : PERMISSIONS_ADAPTER_FACTORY.verifiedPermissionsAdapterOf(Currency.unwrap(currency));
        if (permissionedToken == address(0)) {
            // token is not a permissioned token, use the default implementation
            if (payer == address(this)) {
                currency.transfer(address(poolManager), amount);
            } else {
                // Casting from uint256 to uint160 is safe due to limits on the total supply of a pool
                PERMIT2.transferFrom(payer, address(poolManager), uint160(amount), Currency.unwrap(currency));
            }
            return;
        }
        // token is permissioned, wrap the token and transfer it to the pool manager
        IPermissionsAdapter permissionsAdapter = IPermissionsAdapter(Currency.unwrap(currency));
        if (payer == address(this)) {
            // allowlist check necessary to ensure a disallowed user cannot sell a permissioned token
            if (!permissionsAdapter.isAllowed(msgSender(), PermissionFlags.SWAP_ALLOWED)) {
                revert Unauthorized();
            }
            Currency.wrap(permissionedToken).transfer(address(permissionsAdapter), amount);
            permissionsAdapter.wrapToPoolManager(amount);
        } else {
            // token is a permissioned token, wrap the token
            PERMIT2.transferFrom(payer, address(permissionsAdapter), uint160(amount), permissionedToken);
            permissionsAdapter.wrapToPoolManager(amount);
        }
    }

    /// @notice Calculates the amount for a settle action
    function _mapSettleAmount(uint256 amount, Currency currency) internal view override returns (uint256) {
        address permissionedToken = address(PERMISSIONS_ADAPTER_FACTORY) == address(0)
            ? address(0)
            : PERMISSIONS_ADAPTER_FACTORY.verifiedPermissionsAdapterOf(Currency.unwrap(currency));
        // use the default implementation unless the currency is a permissioned token with a balance on the router
        if (permissionedToken == address(0) || amount != ActionConstants.CONTRACT_BALANCE) {
            return super._mapSettleAmount(amount, currency);
        }
        return Currency.wrap(permissionedToken).balanceOfSelf();
    }
}
