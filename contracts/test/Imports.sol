// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC1155} from 'solmate/tokens/ERC1155.sol';
import {PermitPost} from 'permitpost/src/PermitPost.sol';

// this contract only exists to pull contracts into the hardhat build pipeline
// so that typechain artifacts are generated for them
abstract contract Imports is ERC1155, PermitPost {}
