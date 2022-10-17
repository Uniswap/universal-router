// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC721} from 'solmate/src/tokens/ERC721.sol';

// this contract only exists to pull ERC1155 into the hardhat build pipeline
// so that typechain artifacts are generated for it
contract MockERC721 is ERC721 {
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    }

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function tokenURI(uint256) public override pure returns (string memory) {
        return "";
    }
}
