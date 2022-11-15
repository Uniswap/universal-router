// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/console2.sol";
import "forge-std/StdJson.sol";
import "forge-std/Script.sol";
import {RouterParameters} from "contracts/deploy/RouterParameters.sol";
import {UnsupportedProtocol} from "contracts/deploy/UnsupportedProtocol.sol";
import {Router} from "contracts/Router.sol";
import {Permit2} from 'permit2/src/Permit2.sol';

bytes32 constant SALT = bytes32(uint256(0x1234));

contract DeployRouter is Script {
  using stdJson for string;

    function setUp() public {}

    function run(RouterParameters memory params) public returns (Router router) {
        vm.startBroadcast();

        address unsupported = address(new UnsupportedProtocol{salt: SALT}());

        params = RouterParameters({
            permit2: mapUnsupported(params.permit2, unsupported),
            weth9: mapUnsupported(params.weth9, unsupported),
            seaport: mapUnsupported(params.seaport, unsupported),
            nftxZap: mapUnsupported(params.nftxZap, unsupported),
            x2y2: mapUnsupported(params.x2y2, unsupported),
            foundation: mapUnsupported(params.foundation, unsupported),
            sudoswap: mapUnsupported(params.sudoswap, unsupported),
            nft20Zap: mapUnsupported(params.nft20Zap, unsupported),
            cryptopunks: mapUnsupported(params.cryptopunks, unsupported),
            looksRare: mapUnsupported(params.looksRare, unsupported),
            routerRewardsDistributor: mapUnsupported(params.routerRewardsDistributor, unsupported),
            looksRareRewardsDistributor: mapUnsupported(params.looksRareRewardsDistributor, unsupported),
            looksRareToken: mapUnsupported(params.looksRareToken, unsupported),
            v2Factory: mapUnsupported(params.v2Factory, unsupported),
            v3Factory: mapUnsupported(params.v3Factory, unsupported),
            pairInitCodeHash: params.pairInitCodeHash,
            poolInitCodeHash: params.poolInitCodeHash
        });

        router = new Router{salt: SALT}(params);
        console2.log("Router Deployed:", address(router));
        vm.stopBroadcast();

        return router;
    }

    function run(string memory pathToJSON, address permit2) public returns (Router router) {
        RouterParameters memory params = fetchParameters(pathToJSON);
        params.permit2 = permit2;
        return run(params);
    }

    function run(string memory pathToJSON) public returns (Router router) {
        vm.startBroadcast();
        address permit2 = address(new Permit2{salt: SALT}());
        console2.log("Permit2 Deployed:", address(permit2));

        return run(pathToJSON, address(permit2));
    }

    function fetchParameters(string memory pathToJSON) internal returns (RouterParameters memory params) {
      string memory root = vm.projectRoot();
      string memory json = vm.readFile(string.concat(root, "/", pathToJSON));
      bytes memory rawParams = json.parseRaw(".*");
      params = abi.decode(rawParams, (RouterParameters));
    }

    function mapUnsupported(address protocol, address unsupported) internal returns (address) {
      return protocol == address(0) ? unsupported : protocol;
    }
}
