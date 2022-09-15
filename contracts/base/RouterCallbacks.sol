// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

contract RouterCallbacks {

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }   

}