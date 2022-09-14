// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/console2.sol";
import "forge-std/Script.sol";
import {ReferenceNFTMarketplaceRouter} from "../contracts/modules/NFTMarketplaceRouter/ReferenceNFTMarketplaceRouter.sol";

contract DeployMarketplaceRouter is Script {
    error DeployFailed();
    error NoFactoryProxy();

    address constant CREATE2_PROXY_DEPLOYER = 0x4c8D290a1B368ac4728d83a9e8321fC3af2b39b1;
    address constant CREATE2_PROXY = 0x7A0D94F55792C434d74a40883C6ed8545E406D12;

    function setUp() public {}

    function run() public {
        ReferenceNFTMarketplaceRouter local = new ReferenceNFTMarketplaceRouter();
        if (CREATE2_PROXY.code.length == 0) {
            revert NoFactoryProxy();
        }

        vm.broadcast();
        (bool success, bytes memory response) = CREATE2_PROXY.call(address(local).code);

        if (!success) {
            revert DeployFailed();
        }

        console2.log("ReferenceNFTMarketplaceRouter deployed:", _parseAddress(response));
    }

    function _parseAddress(bytes memory output) internal pure returns (address result) {
        assembly {
            result := mload(add(output, 20))
        } 
    }
}
