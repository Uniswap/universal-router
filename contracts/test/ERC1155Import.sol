// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';

// this contract only exists to pull ERC1155 into the hardhat build pipeline
// so that typechain artifacts are generated for it
abstract contract ERC1155Import is ERC1155 {}
