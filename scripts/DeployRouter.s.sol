// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/console2.sol";
import "forge-std/Script.sol";
import {Router} from "contracts/Router.sol";
import {Permit2} from 'permit2/src/Permit2.sol';
import {DeployParameters} from './DeployParameters.sol';

bytes32 constant SALT = bytes32(uint256(0x1234));

contract DeployRouter is Script {
    function setUp() public {}

    function run() public returns (Router router) {
        vm.startBroadcast();

        address permit2 = DeployParameters.Permit2;
        if (permit2 == address(0)) {
          // if no permit contract is given then deploy
          permit2 = address(new Permit2{salt: SALT}());
          console2.log("Permit2 Deployed:", address(permit2));
        }

        router = new Router{salt: SALT}(
          permit2,
          DeployParameters.RouterRewardsDistributor,
          DeployParameters.LooksRareRewardsDistributor,
          DeployParameters.LooksRareToken,
          DeployParameters.V2Factory,
          DeployParameters.V3Factory,
          DeployParameters.PairInitCodeHash,
          DeployParameters.PoolInitCodeHash
        );
        console2.log("Router Deployed:", address(router));
        vm.stopBroadcast();

        return router;
    }
}
