// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface IRewardsCollector {
    function rewardsDistributor() external returns (address);
    function sendRewards(bytes calldata) external;
}
