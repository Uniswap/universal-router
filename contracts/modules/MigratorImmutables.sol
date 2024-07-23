// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {INonfungiblePositionManager} from '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';

struct MigratorParameters {
    address v3PositionManager;
}

contract MigratorImmutables {
    /// @notice v3PositionManager address
    INonfungiblePositionManager internal immutable V3_POSITION_MANAGER;

    constructor(MigratorParameters memory params) {
        V3_POSITION_MANAGER = INonfungiblePositionManager(params.v3PositionManager);
    }
}
