// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IV3FeeAdapter} from '../../../contracts/interfaces/external/IV3FeeAdapter.sol';

/// @notice Stands in for the v3 protocol fee adapter that owns the v3 factory: records each poke the way the
/// real adapter would before pushing a fee into the pool.
contract MockV3FeeAdapter is IV3FeeAdapter {
    uint256 public calls;
    address public lastPool;
    address public lastCaller;

    function triggerFeeUpdate(address pool) external {
        calls++;
        lastPool = pool;
        lastCaller = msg.sender;
    }
}

/// @notice A v3 fee adapter whose poke always reverts, to exercise the failure path.
contract RevertingV3FeeAdapter is IV3FeeAdapter {
    error PokeRejected();

    function triggerFeeUpdate(address) external pure {
        revert PokeRejected();
    }
}

/// @notice Minimal v3 factory exposing only owner(), which the router reads to find the fee adapter.
contract MockV3Factory {
    address public owner;

    function setOwner(address newOwner) external {
        owner = newOwner;
    }
}
