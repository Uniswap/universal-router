// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/console2.sol";
import "forge-std/Script.sol";
import {ReferenceNFTMarketplaceRouter} from "../contracts/modules/NFTMarketplaceRouter/ReferenceNFTMarketplaceRouter.sol";

contract DeployMarketplaceRouter is Script {
    function setUp() public {}

    function run(address admin) public {
        vm.broadcast();
        ReferenceNFTMarketplaceRouter router =  new ReferenceNFTMarketplaceRouter{salt: hex"00"}(admin);

        console2.log("ReferenceNFTMarketplaceRouter deployed:", address(router));
        console2.log("ReferenceNFTMarketplaceRouter owner:", ReferenceNFTMarketplaceRouter(payable(router)).owner());
    }
}
