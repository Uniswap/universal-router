// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Provides function for deriving a v2 and v3 pool address
library UniswapPoolHelper {
    bytes32 internal constant POOL_INIT_CODE_HASH_V2 =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    function computePoolAddress(address factory, bytes memory identifier, bytes32 initCodeHash)
        internal
        pure
        returns (address pool)
    {
        pool =
            address(uint160(uint256(keccak256(abi.encodePacked(hex'ff', factory, keccak256(identifier), initCodeHash)))));
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(reserveIn > 0 && reserveOut > 0);
        uint256 amountInWithFee = amountIn*997;
        uint256 numerator = amountInWithFee*reserveOut;
        uint256 denominator = reserveIn*1000+amountInWithFee;
        amountOut = numerator / denominator;
    }

    function computeV2Address(
        address factory,
        address tokenA,
        address tokenB
    ) internal pure returns (address) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        return computePoolAddress(factory, abi.encodePacked(token0, token1), POOL_INIT_CODE_HASH_V2);
    }

    // performs chained getAmountIn calculations on any number of pairs
    // function getAmountsIn(
    //     address factory,
    //     uint256 amountOut,
    //     address[] memory path
    // ) internal view returns (uint256[] memory amounts) {
    //     require(path.length >= 2);
    //     amounts = new uint256[](path.length);
    //     amounts[amounts.length - 1] = amountOut;
    //     for (uint256 i = path.length - 1; i > 0; i--) {
    //         (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
    //         amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
    //     }
    // }
}
