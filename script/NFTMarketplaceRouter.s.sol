// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "forge-std/Script.sol";
import {NFTMarketplaceRouter} from "contracts/modules/NFTMarketplaceRouter.sol";

contract NFTMarketplaceRouterScript is Script {
    function run() public {
        vm.startBroadcast();
        NFTMarketplaceRouter router = new NFTMarketplaceRouter();
        vm.stopBroadcast();
    }
}
