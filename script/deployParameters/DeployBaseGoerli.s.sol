// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {DeployUniversalRouter} from '../DeployUniversalRouter.s.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';

contract DeployBaseGoerli is DeployUniversalRouter {
    function setUp() public override {
        params = RouterParameters({
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            weth9: 0x44D627f900da8AdaC7561bD73aA745F132450798,
            v2Factory: UNSUPPORTED_PROTOCOL,
            v3Factory: 0x9323c1d6D800ed51Bd7C6B216cfBec678B7d0BC2,
            pairInitCodeHash: BYTES32_ZERO,
            poolInitCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54,
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0)
        });

        unsupported = 0x7B46ee9BaB49bd5b37117494689A035b0F187B59;
    }
}
