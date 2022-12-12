// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {UniswapV2Test} from '../UniswapV2.t.sol';

contract V2WethApe is UniswapV2Test {
    ERC20 constant APE = ERC20(0x4d224452801ACEd8B2F0aebE155379bb5D594381);

    function token0() internal pure override returns (address) {
        return address(APE);
    }

    function token1() internal pure override returns (address) {
        return address(WETH9);
    }
}
