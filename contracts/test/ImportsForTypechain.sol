// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {ERC1155} from 'solmate/src/tokens/ERC1155.sol';
import {Permit2} from 'permit2/src/Permit2.sol';

// this contract only exists to pull ERC1155 and Permit2 into the hardhat build pipeline
// so that typechain artifacts are generated for it
abstract contract ImportsForTypechain is ERC1155, Permit2 {}
