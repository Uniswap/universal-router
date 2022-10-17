// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

library Decoders {
    function v2SwapExactIn(bytes calldata inputs) pure internal returns (uint256 amountOutMin, address[] memory path, address recipient) {
        return abi.decode(inputs, (uint256, address[], address));
    }
}
