// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';

// this contract only exists to pull ERC1155 into the hardhat build pipeline
// so that typechain artifacts are generated for it
contract MockERC1155 is ERC1155 {
    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function uri(uint256 tokenId) public override view returns (string memory) {
        return "";
    }
}
