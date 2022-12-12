// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {UniswapV2Test} from '../UniswapV2.t.sol';

contract V2DaiWeth is UniswapV2Test {
    ERC20 constant DAI = ERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);

    function token0() internal pure override returns (address) {
        return address(WETH9);
    }

    function token1() internal pure override returns (address) {
        return address(DAI);
    }
}
