// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../interfaces/IRewardsExtractor.sol';

contract RewardsExtractor is IRewardsExtractor {
    event RewardsSent(uint256 amount);

    address public immutable rewardsDistributor;
    IERC20 constant LOOKS_RARE_TOKEN = IERC20(0xf4d2888d29D722226FafA5d9B24F9164c092421E);

    constructor(address _rewardsDistributor) {
        rewardsDistributor = _rewardsDistributor;
    }

    function sendRewards() external {
        uint256 balance = LOOKS_RARE_TOKEN.balanceOf(address(this));
        LOOKS_RARE_TOKEN.transfer(rewardsDistributor, balance);
        emit RewardsSent(balance);
    }
}
