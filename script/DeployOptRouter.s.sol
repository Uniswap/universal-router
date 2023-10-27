// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {CalldataOptRouter} from 'contracts/CalldataOptRouter.sol';
import {UniswapParameters, UniswapImmutables} from '../contracts/modules/uniswap/UniswapImmutables.sol';
import {PaymentsParameters, PaymentsImmutables} from '../contracts/modules/PaymentsImmutables.sol';

bytes32 constant SALT = bytes32(uint256(0x00000000000000000000000000000000000000005eb67581652632000a6cbedf));

contract DeployOptRouter is Script {
    address constant UNSUPPORTED_PROTOCOL = address(0);
    bytes32 constant BYTES32_ZERO = bytes32(0);

    // set values for params and unsupported
    function setUp() public {}

    function run() external returns (CalldataOptRouter router) {
        vm.startBroadcast();

        UniswapParameters memory uniswapParametersArbitrum = UniswapParameters(
            0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f, // V2 Factory Arbitrum
            0x1F98431c8aD98523631AE4a59f267346ea31F984, // V3 Factory Arbitrum
            0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f, // V2 Pair Initcode Hash
            0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54 // V3 Pool Initcode Hash
        );

        PaymentsParameters memory paymentsParametersArbitrum = PaymentsParameters(
            0x000000000022D473030F116dDEE9F6B43aC78BA3, // Permit2 Arbitrum
            0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, // WETH9 Arbitrum
            UNSUPPORTED_PROTOCOL,
            UNSUPPORTED_PROTOCOL,
            UNSUPPORTED_PROTOCOL,
            UNSUPPORTED_PROTOCOL
        );

        address usdcAddress = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

        router = new CalldataOptRouter(uniswapParametersArbitrum, paymentsParametersArbitrum, usdcAddress);
        console2.log('Router Deployed:', address(router));
        vm.stopBroadcast();
    }
}
