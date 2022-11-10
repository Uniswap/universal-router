// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

/// @title Deploy Parameters
/// @notice Constant state used for deploy
library DeployParameters {
  address constant Permit2 = address(0);                     // mainnet: 0x0000000000000000000000000000000000000000
  address constant RouterRewardsDistributor = address(0);    // mainnet: 0x0000000000000000000000000000000000000000
  address constant LooksRareRewardsDistributor = address(0); // mainnet: 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72
  address constant LooksRareToken = address(0);              // mainnet: 0xf4d2888d29D722226FafA5d9B24F9164c092421E
  address constant V2Factory = address(0);                   // mainnet: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
  address constant V3Factory = address(0);                   // mainnet: 0x1F98431c8aD98523631AE4a59f267346ea31F984
  bytes32 constant PairInitCodeHash = 0x00;                  // mainnet: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f
  bytes32 constant PoolInitCodeHash = 0x00;                  // mainnet: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
}
