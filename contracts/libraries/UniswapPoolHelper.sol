// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

/// @title Provides function for deriving a v2 and v3 pool address
library UniswapPoolHelper {
    function computePoolAddress(
        address factory,
        bytes memory identifier,
        bytes32 initCodeHash
    ) internal pure returns (address pool) {
        pool = address(
            uint160(uint256(keccak256(abi.encodePacked(hex'ff', factory, keccak256(identifier), initCodeHash))))
        );
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}
