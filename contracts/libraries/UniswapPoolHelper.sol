// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Provides function for deriving a v2 and v3 pool address
library UniswapPoolHelper {
    function computeV3Address(address factory, bytes memory identifier, bytes32 initCodeHash)
        internal
        pure
        returns (address pool)
    {
        pool =
            address(uint160(uint256(keccak256(abi.encodePacked(hex'ff', factory, keccak256(identifier), initCodeHash)))));
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB);
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0));
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, 'INSUFFICIENT_INPUT_AMOUNT');
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
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // init code hash
                        )
                    )
                )
            )
        );
    }
}
