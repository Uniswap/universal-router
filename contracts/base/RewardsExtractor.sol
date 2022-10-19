// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract RewardsExtractor {
  address immutable public distributor;
  IERC20 constant LOOKS_RARE_TOKEN = IERC20(0xf4d2888d29D722226FafA5d9B24F9164c092421E);

  constructor(address _distributor) {
    distributor = _distributor;
  }

  function sendRewards() external {
    LOOKS_RARE_TOKEN.transfer(distributor, LOOKS_RARE_TOKEN.balanceOf(address(this)));
  }
}
