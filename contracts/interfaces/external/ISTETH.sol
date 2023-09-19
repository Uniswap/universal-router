// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/// @title Partial interface for stETH
interface ISTETH is IERC20 {
    function getSharesByPooledEth(uint256 _ethAmount) external view returns (uint256);
}
