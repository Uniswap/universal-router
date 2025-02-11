// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {RouterParameters} from 'contracts/types/RouterParameters.sol';
import {UnsupportedProtocol} from 'contracts/deploy/UnsupportedProtocol.sol';
import {UniversalRouter} from 'contracts/UniversalRouter.sol';

bytes32 constant SALT = bytes32(uint256(0x00000000000000000000000000000000000000005eb67581652632000a6cbedf));

abstract contract DeployUniversalRouter is Script {
    RouterParameters internal params;
    address internal unsupported;

    address constant UNSUPPORTED_PROTOCOL = address(0);
    bytes32 constant BYTES32_ZERO = bytes32(0);

    error Permit2NotDeployed();

    // set values for params and unsupported
    function setUp() public virtual;

    function run() external returns (UniversalRouter router) {
        vm.startBroadcast();

        // deploy permit2 if it isnt yet deployed
        if (params.permit2 == address(0)) revert Permit2NotDeployed();

        // only deploy unsupported if this chain doesn't already have one
        if (unsupported == address(0)) {
            unsupported = address(new UnsupportedProtocol());
            console2.log('UnsupportedProtocol deployed:', unsupported);
        }

        params = RouterParameters({
            permit2: mapUnsupported(params.permit2),
            weth9: mapUnsupported(params.weth9),
            v2Factory: mapUnsupported(params.v2Factory),
            v3Factory: mapUnsupported(params.v3Factory),
            pairInitCodeHash: params.pairInitCodeHash,
            poolInitCodeHash: params.poolInitCodeHash,
            v4PoolManager: mapUnsupported(params.v4PoolManager),
            v3NFTPositionManager: mapUnsupported(params.v3NFTPositionManager),
            v4PositionManager: mapUnsupported(params.v4PositionManager)
        });

        logParams();

        router = new UniversalRouter(params);
        console2.log('Universal Router Deployed:', address(router));
        vm.stopBroadcast();
    }

    function logParams() internal view {
        console2.log('permit2:', params.permit2);
        console2.log('weth9:', params.weth9);
        console2.log('v2Factory:', params.v2Factory);
        console2.log('v3Factory:', params.v3Factory);
        console2.log('v4PoolManager:', params.v4PoolManager);
        console2.log('v3NFTPositionManager:', params.v3NFTPositionManager);
        console2.log('v4PositionManager:', params.v4PositionManager);
    }

    function mapUnsupported(address protocol) internal view returns (address) {
        return protocol == address(0) ? unsupported : protocol;
    }
}
