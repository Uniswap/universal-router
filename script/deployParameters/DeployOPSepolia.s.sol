// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployOPSepolia is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x4200000000000000000000000000000000000006,
            v2Factory: UNSUPPORTED_PROTOCOL,
            v3Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: 0xE5dF461803a59292c6c03978c17857479c40bc46,
            v3NFTPositionManager: 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2,
            v4PositionManager: 0xEf3853450006cE9FB12B540486c920c9a705F502
        });

        unsupported = 0xFC885F37F5A9FA8159c8dBb907fc1b0C2fB31323;
    }
}
