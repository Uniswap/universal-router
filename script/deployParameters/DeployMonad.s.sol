// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployMonad is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A,
            v2Factory: 0x182a927119D56008d921126764bF884221b10f59,
            v3Factory: 0x204FAca1764B154221e35c0d20aBb3c525710498,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e,
            permissionsAdapterFactory: address(0), // ToDo: Add permissions adapter factory
            v3NFTPositionManager: 0x7197E214c0b767cFB76Fb734ab638E2c192F4E53,
            v4PositionManager: 0x5b7eC4a94fF9beDb700fb82aB09d5846972F4016,
            spokePool: UNSUPPORTED_PROTOCOL
        });

        unsupported = 0x8B844f885672f333Bc0042cB669255f93a4C1E6b;
    }
}
