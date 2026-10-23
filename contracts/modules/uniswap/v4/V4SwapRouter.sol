// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {UniswapImmutables} from '../UniswapImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {SafeCast} from '@uniswap/v4-core/src/libraries/SafeCast.sol';
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

    /// @notice Maps the USE_RESOLVED_AMOUNT sentinel in a v4 swap amount field through the RESOLVE register
    /// @dev Reverts on a register value that does not fit uint128, since v4 swap amounts are uint128
    function _mapSwapAmount(uint128 amount) internal view override returns (uint128) {
        return ResolvedAmount.map(amount).toUint128();
    }

    /// @notice Maps the USE_RESOLVED_AMOUNT sentinel in a SETTLE amount through the RESOLVE register
    function _mapSettleAmount(uint256 amount, Currency currency) internal view override returns (uint256) {
        return super._mapSettleAmount(ResolvedAmount.map(amount), currency);
    }

    /// @notice Maps the USE_RESOLVED_AMOUNT sentinel in a TAKE amount through the RESOLVE register
    function _mapTakeAmount(uint256 amount, Currency currency) internal view override returns (uint256) {
        return super._mapTakeAmount(ResolvedAmount.map(amount), currency);
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
