// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import '../interfaces/IRewardsCollector.sol';

contract RewardsCollector is IRewardsCollector {
    using SafeTransferLib for ERC20;

    event RewardsSent(uint256 amount);

    error UnableToClaim();

    address public immutable rewardsDistributor;
    address public constant LOOKSRARE_REWARDS_DISTRIBUTOR = 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72;
    ERC20 constant LOOKS_RARE_TOKEN = ERC20(0xf4d2888d29D722226FafA5d9B24F9164c092421E);

    constructor(address _rewardsDistributor) {
        rewardsDistributor = _rewardsDistributor;
    }

    function sendRewards(bytes calldata looksRareClaim) external {
        (bool success,) = LOOKSRARE_REWARDS_DISTRIBUTOR.call(looksRareClaim);
        if (!success) revert UnableToClaim();

        uint256 balance = LOOKS_RARE_TOKEN.balanceOf(address(this));
        LOOKS_RARE_TOKEN.transfer(rewardsDistributor, balance);
        emit RewardsSent(balance);
    }
}
