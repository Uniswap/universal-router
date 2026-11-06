// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IV3SpokePool} from '../../../contracts/interfaces/external/IV3SpokePool.sol';

/// @notice Pulls the deposited ERC20 like the Across SpokePool and records the amounts it was called with.
contract MockSpokePool is IV3SpokePool {
    uint256 public lastInputAmount;
    uint256 public lastOutputAmount;

    function depositV3(
        address,
        address,
        address inputToken,
        address,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256,
        address,
        uint32,
        uint32,
        uint32,
        bytes calldata
    ) external payable {
        lastInputAmount = inputAmount;
        lastOutputAmount = outputAmount;
        if (msg.value == 0) IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount);
    }
}
