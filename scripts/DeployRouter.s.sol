// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/console2.sol";
import "forge-std/Script.sol";
import {Router} from "contracts/Router.sol";
import {Permit2} from 'permit2/src/Permit2.sol';

bytes32 constant SALT = bytes32(uint256(0x1234));

contract DeployRouter is Script {
    function setUp() public {}

    function run(
      address permit2,
      address routerRewardsDistributor,
      address looksRareRewardsDistributor,
      address looksRareToken,
      address v2Factory,
      address v3Factory,
      bytes32 pairInitCodeHash,
      bytes32 poolInitCodeHash
    ) public returns (Router router) {
        vm.startBroadcast();

        if (permit2 == address(0)) {
          // if no permit contract is given then deploy
          permit2 = address(new Permit2{salt: SALT}());
          console2.log("Permit2 Deployed:", address(permit2));
        }

        router = new Router{salt: SALT}(
          permit2,
          routerRewardsDistributor,
          looksRareRewardsDistributor,
          looksRareToken,
          v2Factory,
          v3Factory,
          pairInitCodeHash,
          poolInitCodeHash
        );
        console2.log("Router Deployed:", address(router));
        vm.stopBroadcast();

        return router;
    }
}
