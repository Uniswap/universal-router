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

    function run(string memory network) public returns (Router router) {
        vm.startBroadcast();

        DeployParameters memory params = fetchParameters(network);

        address permit2 = params.permit2;
        if (permit2 == address(0)) {
          // if no permit contract is given then deploy
          permit2 = address(new Permit2{salt: SALT}());
          console2.log("Permit2 Deployed:", address(permit2));
        }

        router = new Router{salt: SALT}(
          permit2,
          params.routerRewardsDistributor,
          params.looksRareRewardsDistributor,
          params.looksRareToken,
          params.v2Factory,
          params.v3Factory,
          params.v2PairInitCodehash,
          params.v3PoolInitCodehash
        );
        console2.log("Router Deployed:", address(router));
        vm.stopBroadcast();

        return router;
    }

    function fetchParameters(string memory network) internal returns (DeployParameters memory params) {
      string memory root = vm.projectRoot();
      string memory json = vm.readFile(string.concat(root, "/scripts/deployParameters/", network, ".json"));
      bytes memory rawParams = json.parseRaw(".*");
      params = abi.decode(rawParams, (DeployParameters));
    }
}
