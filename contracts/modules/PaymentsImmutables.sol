// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {IWETH9} from '../interfaces/external/IWETH9.sol';
import {IAllowanceTransfer} from 'permit2/src/interfaces/IAllowanceTransfer.sol';

struct PaymentsParameters {
    address permit2;
    address weth9;
    address openseaConduit;
    address sudoswap;
}

contract PaymentsImmutables {
    /// @dev WETH9 address
    IWETH9 internal immutable WETH9;

    /// @dev Permit2 address
    IAllowanceTransfer internal immutable PERMIT2;

    /// @dev The address of OpenSea's conduit used in both Seaport 1.4 and Seaport 1.5
    address internal immutable OPENSEA_CONDUIT;

    // @dev The address of Sudoswap's router
    address internal immutable SUDOSWAP;

    enum Spenders {
        OSConduit,
        Sudoswap
    }

    constructor(PaymentsParameters memory params) {
        WETH9 = IWETH9(params.weth9);
        PERMIT2 = IAllowanceTransfer(params.permit2);
        OPENSEA_CONDUIT = params.openseaConduit;
        SUDOSWAP = params.sudoswap;
    }
}
