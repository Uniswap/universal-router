// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface IRewardsExtractor {
  function distributor() external returns (address);
  function sendRewards() external;
}
