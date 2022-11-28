// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {MockERC20} from '../mock/MockERC20.sol';
import {UniswapV2Test} from '../UniswapV2.t.sol';

contract V2MockMock is UniswapV2Test {
    MockERC20 mockA;
    MockERC20 mockB;

    function setUpTokens() internal override {
        mockA = new MockERC20();
        mockB = new MockERC20();
    }

    function token0() internal view override returns (address) {
        return address(mockA);
    }

    function token1() internal view override returns (address) {
        return address(mockB);
    }
}
