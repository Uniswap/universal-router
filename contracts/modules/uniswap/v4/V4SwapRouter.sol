// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {UniswapImmutables} from '../UniswapImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {SafeCast} from '@uniswap/v4-core/src/libraries/SafeCast.sol';
import {Constants} from '../../../libraries/Constants.sol';
import {ResolvedAmount} from '../../../libraries/ResolvedAmount.sol';
import {PermissionedV4Router} from '@uniswap/v4-periphery/src/hooks/permissionedPools/PermissionedV4Router.sol';
import {
    IPermissionsAdapterFactory
} from '@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapterFactory.sol';
import {
    IPermissionsAdapter
} from '@uniswap/v4-periphery/src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol';

/// @title Router for Uniswap v4 Trades
abstract contract V4SwapRouter is PermissionedV4Router, Permit2Payments {
    using SafeCast for uint256;

    constructor(address _poolManager, address _permissionsAdapterFactory)
        PermissionedV4Router(IPoolManager(_poolManager), IPermissionsAdapterFactory(_permissionsAdapterFactory))
    {}

    /// @notice Resolves the USE_RESOLVED_AMOUNT sentinel in a v4 swap amount field from the RESOLVE register
    /// @dev Reverts on a register value that does not fit uint128, since v4 swap amounts are uint128
    function _mapSwapAmount(uint128 amount) internal view override returns (uint128) {
        if (amount != uint128(Constants.USE_RESOLVED_AMOUNT)) return amount;
        return ResolvedAmount.get().toUint128();
    }

    function _payStandard(Currency currency, address payer, uint256 amount) internal override {
        payOrPermit2Transfer(Currency.unwrap(currency), payer, address(poolManager), amount);
    }

    function _payPermissionedFromPayer(
        address payer,
        IPermissionsAdapter permissionsAdapter,
        address permissionedToken,
        uint256 amount
    ) internal override {
        PERMIT2.transferFrom(payer, address(permissionsAdapter), uint160(amount), permissionedToken);
        permissionsAdapter.wrapToPoolManager(amount);
    }
}
