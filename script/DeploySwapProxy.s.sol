// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {SwapProxy} from 'contracts/SwapProxy.sol';

contract DeploySwapProxy is Script {
    function run() external returns (SwapProxy swapProxy) {
        vm.startBroadcast();
        swapProxy = new SwapProxy();
        console2.log('SwapProxy Deployed:', address(swapProxy));
        vm.stopBroadcast();
    }
}
