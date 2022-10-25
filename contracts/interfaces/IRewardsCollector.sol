// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface IRewardsCollector {
    function routerRewardsDistributor() external returns (address);
    function collectRewards(bytes calldata) external;
}
