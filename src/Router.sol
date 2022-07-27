// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

contract Router {
    struct ModuleCall {
        address module;
        bytes data;
    }

    function route(ModuleCall[] calldata calls) external {
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory resultData) = calls[i].module.delegatecall(calls[i].data);
            if (!success) assembly {
                revert(add(resultData, 32), mload(resultData))
            }
        }
    }
}
