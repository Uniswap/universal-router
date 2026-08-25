// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @notice Minimal but faithful port of UniswapV2Pair's swap/skim/sync/getReserves semantics.
/// @dev The constructor takes no arguments so that the CREATE2 init code hash is stable, matching the
/// real UniswapV2Factory deployment scheme that UniswapV2Library.pairFor depends on.
contract MockV2Pair {
    error Locked();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InsufficientInputAmount();
    error KInvariant();
    error Overflow();

    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 private _blockTimestampLast;

    uint256 private _unlocked = 1;

    modifier lock() {
        if (_unlocked != 1) revert Locked();
        _unlocked = 0;
        _;
        _unlocked = 1;
    }

    function initialize(address tokenA, address tokenB) external {
        token0 = tokenA;
        token1 = tokenB;
    }

    function getReserves() public view returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, _blockTimestampLast);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();
        _reserve0 = uint112(balance0);
        _reserve1 = uint112(balance1);
        _blockTimestampLast = uint32(block.timestamp);
    }

    function sync() external lock {
        _update(ERC20(token0).balanceOf(address(this)), ERC20(token1).balanceOf(address(this)));
    }

    /// @notice Permissionless recovery of any balance held in excess of recorded reserves
    function skim(address to) external lock {
        address tokenA = token0;
        address tokenB = token1;
        ERC20(tokenA).transfer(to, ERC20(tokenA).balanceOf(address(this)) - _reserve0);
        ERC20(tokenB).transfer(to, ERC20(tokenB).balanceOf(address(this)) - _reserve1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external lock {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 reserve0_, uint112 reserve1_,) = getReserves();
        if (amount0Out >= reserve0_ || amount1Out >= reserve1_) revert InsufficientLiquidity();

        if (amount0Out > 0) ERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) ERC20(token1).transfer(to, amount1Out);

        uint256 balance0 = ERC20(token0).balanceOf(address(this));
        uint256 balance1 = ERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > reserve0_ - amount0Out ? balance0 - (reserve0_ - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1_ - amount1Out ? balance1 - (reserve1_ - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        // 0.30% fee, identical to UniswapV2Pair
        uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
        uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
        if (balance0Adjusted * balance1Adjusted < uint256(reserve0_) * uint256(reserve1_) * (1000 ** 2)) {
            revert KInvariant();
        }

        _update(balance0, balance1);
    }
}

/// @notice CREATE2 factory using the same salt scheme as UniswapV2Factory
contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        (address tokenLow, address tokenHigh) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pair = address(new MockV2Pair{salt: keccak256(abi.encodePacked(tokenLow, tokenHigh))}());
        MockV2Pair(pair).initialize(tokenLow, tokenHigh);
        getPair[tokenLow][tokenHigh] = pair;
        getPair[tokenHigh][tokenLow] = pair;
    }

    function pairInitCodeHash() external pure returns (bytes32) {
        return keccak256(type(MockV2Pair).creationCode);
    }
}
