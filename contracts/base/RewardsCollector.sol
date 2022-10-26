// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import '../interfaces/IRewardsCollector.sol';

contract RewardsCollector is IRewardsCollector {
    using SafeTransferLib for ERC20;

    event RewardsSent(uint256 amount);

    error UnableToClaim();

    address public immutable routerRewardsDistributor;
    address public immutable looksRareRewardsDistributor;
    ERC20 public immutable looksRareToken;

    constructor(address _routerRewardsDistributor, address _looksRareRewardsDistributor, address _looksRareToken) {
        routerRewardsDistributor = _routerRewardsDistributor;
        looksRareRewardsDistributor = _looksRareRewardsDistributor;
        looksRareToken = ERC20(_looksRareToken);
    }

    function collectRewards(bytes calldata looksRareClaim) external {
        (bool success,) = looksRareRewardsDistributor.call(looksRareClaim);
        if (!success) revert UnableToClaim();

        uint256 balance = looksRareToken.balanceOf(address(this));
        looksRareToken.transfer(routerRewardsDistributor, balance);
        emit RewardsSent(balance);
    }
}
