// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {Permit2} from 'permit2/src/Permit2.sol';
import {TestDeployBootstrap} from './TestDeployBootstrap.sol';

/// @notice deployment bootstrap for Mainnet
contract TestDeployBootstrapPermit2 is TestDeployBootstrap {
    constructor(address looksRareDistributor, address looksRareToken)
        TestDeployBootstrap(address(new Permit2()), looksRareDistributor, looksRareToken)
    {}
}
