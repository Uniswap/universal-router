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
    address public immutable looksrareRewardsDistributor;
    ERC20 immutable looksRareToken;

    constructor(address _routerRewardsDistributor, address _looksrareRewardsDistributor, address _looksRareToken) {
        routerRewardsDistributor = _routerRewardsDistributor;
        looksrareRewardsDistributor = _looksrareRewardsDistributor;
        looksRareToken = ERC20(_looksRareToken);
    }

    function collectRewards(bytes calldata looksRareClaim) external {
        (bool success,) = looksrareRewardsDistributor.call(looksRareClaim);
        if (!success) revert UnableToClaim();

        uint256 balance = looksRareToken.balanceOf(address(this));
        looksRareToken.transfer(routerRewardsDistributor, balance);
        emit RewardsSent(balance);
    }
}
