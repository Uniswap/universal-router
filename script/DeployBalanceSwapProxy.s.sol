// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {BalanceSwapProxy} from 'contracts/BalanceSwapProxy.sol';

contract DeployBalanceSwapProxy is Script {
    // canonical Permit2, same address on all chains
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    function run() external returns (BalanceSwapProxy balanceSwapProxy) {
        vm.startBroadcast();
        balanceSwapProxy = new BalanceSwapProxy(PERMIT2);
        console2.log('BalanceSwapProxy Deployed:', address(balanceSwapProxy));
        vm.stopBroadcast();
    }
}
