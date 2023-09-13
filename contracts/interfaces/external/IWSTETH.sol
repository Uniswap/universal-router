// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/// @title Interface for wstETH
interface IWSTETH is IERC20 {
    /// @notice wrap steth to get wsteth
    function wrap(uint256 stETHAmount) external returns (uint256);

    /// @notice unwrap wsteth to get steth
    function unwrap(uint256 wstETHAmount) external returns (uint256);

    function tokensPerStEth() external view returns (uint256);

    function stEthPerToken() external view returns (uint256);

    function stETH() external view returns (address);

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
