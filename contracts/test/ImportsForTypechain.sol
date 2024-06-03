// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';

// this contract only exists to pull ERC1155 into the hardhat build pipeline
// so that typechain artifacts are generated for it
abstract contract ImportsForTypechain is ERC1155 {}
