// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/tokens/ERC20.sol';

interface IRewardsCollector {
    function collectRewards(bytes calldata) external;
}
