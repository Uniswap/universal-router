// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {IV4FeeAdapter} from '../../../contracts/interfaces/external/IV4FeeAdapter.sol';

/// @notice Stands in for the protocol fee adapter registered as the PoolManager's protocolFeeController: records
/// each poke and, like the real adapter, pushes a fee into PoolManager state for the poked pool.
contract MockV4FeeAdapter is IV4FeeAdapter {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable manager;
    uint24 public immutable fee;

    uint256 public calls;
    PoolId public lastPoolId;
    address public lastCaller;

    constructor(IPoolManager _manager, uint24 _fee) {
        manager = _manager;
        fee = _fee;
    }

    function triggerFeeUpdate(PoolKey calldata key) external {
        calls++;
        lastPoolId = key.toId();
        lastCaller = msg.sender;
        manager.setProtocolFee(key, fee);
    }
}

/// @notice A controller whose poke always reverts, to exercise the failure path.
contract RevertingV4FeeAdapter is IV4FeeAdapter {
    error PokeRejected();

    function triggerFeeUpdate(PoolKey calldata) external pure {
        revert PokeRejected();
    }
}
