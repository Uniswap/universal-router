// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

library Encoders {
    function v2SwapExactIn(uint256 amountOutMin, address[] calldata path) view internal returns (bytes memory) {
        return v2SwapExactIn(amountOutMin, path, msg.sender);
    }

    function v2SwapExactIn(uint256 amountOutMin, address[] calldata path, address recipient) pure public returns (bytes memory) {
        return abi.encode(amountOutMin, path, recipient);
    }
}
