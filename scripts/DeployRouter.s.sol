// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/console2.sol";
import "forge-std/StdJson.sol";
import "forge-std/Script.sol";
import {Router} from "contracts/Router.sol";
import {Permit2} from 'permit2/src/Permit2.sol';

struct DeployParameters {
  address permit2;
  address routerRewardsDistributor;
  address looksRareRewardsDistributor;
  address looksRareToken;
  address v2Factory;
  address v3Factory;
  bytes32 v2PairInitCodehash;
  bytes32 v3PoolInitCodehash;
}

bytes32 constant SALT = bytes32(uint256(0x1234));

contract DeployRouter is Script {
  using stdJson for string;

    function setUp() public {}

    function run(string memory pathToBootstrap, address permit2) public returns (Router router) {
        vm.startBroadcast();

        address bootstrap = deployCode(pathToBootstrap, abi.encode(permit2));

        router = new Router{salt: SALT}(
          bootstrap
        );
        console2.log("Router Deployed:", address(router));
        vm.stopBroadcast();

        return router;
    }

    function run(string memory pathToBootstrap) public returns (Router router) {
        vm.startBroadcast();

        address permit2 = address(new Permit2{salt: SALT}());
        console2.log("Permit2 Deployed:", address(permit2));
        return run(pathToBootstrap, permit2);
    }

    function fetchParameters(string memory pathToJSON) internal returns (DeployParameters memory params) {
      string memory root = vm.projectRoot();
      string memory json = vm.readFile(string.concat(root, "/", pathToJSON));
      bytes memory rawParams = json.parseRaw(".*");
      params = abi.decode(rawParams, (DeployParameters));
    }
}
