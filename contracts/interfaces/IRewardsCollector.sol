// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/tokens/ERC20.sol';

interface IRewardsCollector {
    function routerRewardsDistributor() external returns (address);
    function looksRareRewardsDistributor() external returns (address);
    function looksRareToken() external returns (ERC20);
    function collectRewards(bytes calldata) external;
}
