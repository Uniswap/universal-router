// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';
import {OracleLibrary} from './modules/uniswap/v3/OracleLibrary.sol';

import {UniswapParameters, UniswapImmutables} from './modules/uniswap/UniswapImmutables.sol';
import {PaymentsParameters, PaymentsImmutables} from './modules/PaymentsImmutables.sol';
import {V3Path} from './modules/uniswap/v3/V3Path.sol';
import {Constants} from './libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {
    using V3Path for bytes;

    error TooLargeOfNumber();
    error TooManyHops();
    error NoFeeData();
    error NoFeeTier();
    error IncorrectMsgValue();
    error CannotDoEthToEth();
    error NotEnoughAddresses();

    uint256 constant AMOUNT_IN_OFFSET = 2;
    uint256 constant MAX_ADDRESSES = 8;
    uint256 constant MAX_HOPS = 7;
    uint256 constant ADDRESS_LENGTH = 20;
    uint256 constant FEE_BIT_SIZE = 2;

    uint24 constant TIER_0 = 100;
    uint24 constant TIER_1 = 500;
    uint24 constant TIER_2 = 3000;
    uint24 constant TIER_3 = 10000;

    uint256 constant FEE_BIPS = 15;
    uint256 constant BIPS_DENOMINATOR = 10000;

    address constant FEE_RECIPIENT = address(0xfee15);
    address constant UNSUPPORTED_PROTOCOL = address(0);
    address constant WETH_MAINNET = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    UniswapParameters uniswapParametersArbitrum = UniswapParameters(
        0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f, // V2 Factory Arbitrum
        0x1F98431c8aD98523631AE4a59f267346ea31F984, // V3 Factory Arbitrum
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f, // V2 Pair Initcode Hash
        0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54 // V3 Pool Initcode Hash
    );

    PaymentsParameters paymentsParametersArbitrum = PaymentsParameters(
        0x000000000022D473030F116dDEE9F6B43aC78BA3, // Permit2 Arbitrum
        0x82aF49447D8a07e3bd95BD0d56f35241523fBab1, // WETH9 Arbitrum
        UNSUPPORTED_PROTOCOL,
        UNSUPPORTED_PROTOCOL,
        UNSUPPORTED_PROTOCOL,
        UNSUPPORTED_PROTOCOL
    );

    address immutable localUSDC;

    constructor(UniswapParameters memory uniswapParameters, PaymentsParameters memory paymentsParameters, address _USDC)
        UniswapImmutables(uniswapParameters)
        PaymentsImmutables(paymentsParameters)
    {
        DEADLINE_OFFSET = block.timestamp;
        END_OF_TIME = DEADLINE_OFFSET + (DEADLINE_GRANULARITY * type(uint16).max);
        localUSDC = _USDC;
    }

    /// @notice Thrown when executing commands with an expired deadline
    error TransactionDeadlinePassed();
    error OutOfTime();

    uint256 immutable DEADLINE_OFFSET; // current unix time
    uint256 constant DEADLINE_GRANULARITY = 600; // 10 min increments
    uint256 immutable END_OF_TIME;

    modifier checkDeadline(bytes calldata swapInfo) {
        _checkDeadline(uint16(bytes2(swapInfo[:2])));
        _;
    }

        // can be unsafe if you don't know what you're doing
    // slippage tolerance set to 2% from the 1 minute average
    function swapETHForUSDCOptimized() public payable {
        uint24 _feeTier = 500;
        address _poolAddress = computePoolAddress(address(WETH9), localUSDC, _feeTier);
        uint32 _period = uint32(1 minutes);
        (int24 arithmeticMeanTick,) = OracleLibrary.consult(_poolAddress, _period);

        uint256 _quoteAmount = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick, 
            uint128(msg.value), 
            address(WETH9), 
            localUSDC
        );

        uint256 _minOutput = _quoteAmount * 49 / 50;

        bytes memory _path = abi.encodePacked(address(WETH9), _feeTier, localUSDC);

        WETH9.deposit{value: msg.value}();

        v3SwapExactInput(
            msg.sender,
            msg.value,
            _minOutput,
            _path,
            address(this)
        ); 
    }

    function v3SwapExactTokenForToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;
        bool hasFee;

        (amountIn, amountOutMinimum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:], false, false);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactInput(recipient, amountIn, amountOutMinimum, path, msg.sender);

        if (hasFee) _takeFee(path);
    }

    function v3SwapTokenForExactToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountInMaximum;
        uint256 amountOut;
        bytes memory path;
        bool hasFee;

        (amountOut, amountInMaximum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:], false, false);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactOutput(recipient, amountOut, amountInMaximum, path, msg.sender);

        if (hasFee) _takeFee(path);
    }

    function v3SwapExactETHForToken(bytes calldata swapInfo) external payable checkDeadline(swapInfo) {
        uint256 amountOutMinimum;
        bytes memory path;
        bool hasFee;

        (amountOutMinimum, hasFee, path) = _decodeCalldataOneInput(swapInfo[2:], true, false);

        wrapETH(address(this), msg.value);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactInput(recipient, msg.value, amountOutMinimum, path, address(this));

        if (hasFee) _takeFee(path);
    }

    function v3SwapTokenForExactETH(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;
        bool hasFee;

        (amountIn, amountOutMinimum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:], false, true);

        v3SwapExactOutput(address(this), amountIn, amountOutMinimum, path, msg.sender);

        if (hasFee) {
            uint256 totalAmount = WETH9.balanceOf(address(this));
            uint256 feeAmount = totalAmount * FEE_BIPS / BIPS_DENOMINATOR;
            pay(address(WETH9), FEE_RECIPIENT, feeAmount);
        }

        unwrapWETH9(msg.sender, amountOutMinimum);
    }

    function _decodeCalldataTwoInputs(bytes calldata swapInfo, bool firstEth, bool lastEth)
        internal
        pure
        returns (uint256 preciseAmount, uint256 scientificAmount, bool hasFee, bytes memory path)
    {
        uint256 preciseAmountLength;

        (preciseAmount, preciseAmountLength) = _calculateAmount(swapInfo);
        // use scientific notation for the limit amount
        (scientificAmount, hasFee, path) = _decodeCalldataOneInput(swapInfo[preciseAmountLength + 1:], firstEth, lastEth);
    }

    function _decodeCalldataOneInput(bytes calldata swapInfo, bool firstEth, bool lastEth)
        internal
        pure
        returns (uint256 scientificAmount, bool hasFee, bytes memory path)
    {
        scientificAmount = _calculateScientificAmount(swapInfo[0], swapInfo[1]);
        (hasFee, path) = _parsePaths(swapInfo[2:], firstEth, lastEth);
    }

    function _calculateAmount(bytes calldata swapInfo) internal pure returns (uint256, uint256) {
        bool isScientific = (bytes1(swapInfo[0]) >> 7) != 0;
        uint8 amountLength = uint8((bytes1(swapInfo[0]) << 1) >> 1);
        if (amountLength >= 32) revert TooLargeOfNumber();
        uint256 mask = (2 ** (amountLength * 8)) - 1;
        if (!isScientific) {
            uint256 amount = uint256(bytes32(swapInfo[1:amountLength + 1]) >> (256 - (8 * amountLength)));
            uint256 maskedAmount = mask & amount;
            return (maskedAmount, amountLength);
        } else {
            uint256 coefficient =
                mask & uint256(bytes32(swapInfo[1:amountLength + 1]) >> (256 - (8 * amountLength) + 6));
            uint256 exponent = uint256(uint8(bytes1(swapInfo[amountLength]) & 0x3F));
            return (coefficient * (10 ** exponent), amountLength);
        }
    }

    function _calculateScientificAmount(bytes1 firstByte, bytes1 secondByte) internal pure returns (uint256) {
        // always 2 bytes
        // first 10 bits is the coefficient, max 1023
        // last 6 bits is the exponent, max 63
        uint256 first = uint256(uint8(firstByte));
        uint8 second = uint8(secondByte);
        uint256 exponent = uint256((second << 2) >> 2);
        uint256 coefficient = (first << 2) + uint256(second >> 6);
        return coefficient * (10 ** exponent);
    }

    function _takeFee(bytes memory path) internal {
        address token = path.decodeLastToken();
        uint256 totalAmount = ERC20(token).balanceOf(address(this));
        uint256 feeAmount = totalAmount * FEE_BIPS / BIPS_DENOMINATOR;
        pay(token, FEE_RECIPIENT, feeAmount);
        pay(token, msg.sender, Constants.CONTRACT_BALANCE);
    }

    function _parsePaths(bytes calldata swapInfo, bool firstETH, bool lastETH) internal pure returns (bool, bytes memory) {
        // cap num addresses at 9, fee tiers at 8, so 2 bytes (2 bits * 8), so divide by 4
        // with this, you cannot have more than 20 addresses ever (might be uneccesary)
        if (swapInfo.length > MAX_ADDRESSES * ADDRESS_LENGTH + (MAX_HOPS / 4) || swapInfo.length >= ADDRESS_LENGTH * 20)
        {
            revert TooManyHops();
        }

        if (firstETH && lastETH){
            revert CannotDoEthToEth();
        }

        // receives 20 bytes repeating followed by sets of 2 bit representing fee tiers followed by padding (will either be 1 or 2 bytes)
        // returns of 20 bytes for each address, followed by 3 bytes for the fee tier, repeat forever as bytes memory
        // edge case, the fee tier last bits are makes divisible by 20 bytes.
        uint256 remainder = swapInfo.length % ADDRESS_LENGTH;
        if (remainder == 0) revert NoFeeData();
        bytes memory fees = swapInfo[swapInfo.length - remainder:];
        bool hasFee = (bytes1(fees[0]) >> 7) != 0;
        uint256 numAddresses = (swapInfo.length - remainder) / ADDRESS_LENGTH ;
        if(firstETH || lastETH){
            numAddresses++; 
        }
        if(numAddresses < 2){
            revert NotEnoughAddresses();
        }

        bytes memory paths;
        uint256 addressLocation = 0; 
        for (uint256 i = 0; i < numAddresses; i++) {
            if (i == 0 || i < numAddresses - 1) {
                uint256 shiftLeft = 2 * (i + 1 % 4);
                bytes1 feeByte = fees[(i + 1) / 4];
                uint24 tier = _getTier(uint8((feeByte << shiftLeft) >> 6));
                if(firstETH && i == 0) {
                    paths = abi.encodePacked(paths, WETH_MAINNET, tier);
                } else {
                    paths = abi.encodePacked(paths, swapInfo[addressLocation * ADDRESS_LENGTH:(addressLocation + 1) * ADDRESS_LENGTH], tier);
                    addressLocation++;
                }
            } else {
                if (lastETH) {
                    paths = abi.encodePacked(paths, WETH_MAINNET);
                } else {
                    paths = abi.encodePacked(paths, swapInfo[addressLocation * ADDRESS_LENGTH:(addressLocation + 1) * ADDRESS_LENGTH]);
                }
            }
        }
        return (hasFee, paths);
    }

    function _getTier(uint8 singleByte) internal pure returns (uint24) {
        if (singleByte > 3) {
            revert NoFeeTier();
        } else if (singleByte == 0) {
            return TIER_0;
        } else if (singleByte == 1) {
            return TIER_1;
        } else if (singleByte == 2) {
            return TIER_2;
        } else if (singleByte == 3) {
            return TIER_3;
        } else {
            revert NoFeeTier(); // should not be reachable
        }
    }

    function _checkDeadline(uint16 deadline) internal view {
        if (END_OF_TIME <= block.timestamp) revert OutOfTime();
        if (DEADLINE_OFFSET + (deadline * DEADLINE_GRANULARITY) < block.timestamp) revert TransactionDeadlinePassed();
    }
}
