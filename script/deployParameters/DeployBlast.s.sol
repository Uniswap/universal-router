// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/base/RouterImmutables.sol';

contract DeployBlast is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4300000000000000000000000000000000000004,
            v2Factory: 0x5C346464d33F90bABaf70dB6388507CC889C1070,
            v3Factory: 0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v3NFTPositionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
        });

        unsupported = 0x5ab1B56FB16238dB874258FB7847EFe248eb8496;
    }
}
