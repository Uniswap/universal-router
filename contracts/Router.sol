// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import './base/Payments.sol';
import './base/weiroll/CommandBuilder.sol';
// import 'hardhat/console.sol';

contract WeirollRouter is Payments {
    using CommandBuilder for bytes[];

    error NotGreaterOrEqual(uint256 big, uint256 smol);
    error NotEqual(uint256 equal1, uint256 equal2);
    error ExecutionFailed(uint256 command_index, string message);

    uint256 constant FLAG_CT_PERMIT = 0x00;
    uint256 constant FLAG_CT_TRANSFER = 0x01;
    uint256 constant FLAG_CT_V3SWAP = 0x02;
    uint256 constant FLAG_CT_V2SWAP = 0x03;
    uint256 constant FLAG_CT_CHECK_AMT = 0x04;
    uint256 constant FLAG_CT_MASK = 0x0f;

    uint256 constant FLAG_EXTENDED_COMMAND = 0x80;
    uint256 constant FLAG_TUPLE_RETURN = 0x40;
    uint256 constant SHORT_COMMAND_FILL = 0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    address immutable permitPostAddress;

    constructor(address permitPost) Payments(permitPost) {
        permitPostAddress = permitPost;
    }

    function execute(bytes8[] calldata commands, bytes[] memory state) external returns (bytes[] memory) {
        bytes32 command;
        uint256 commandType;
        uint256 flags;
        bytes32 indices;
        bool success;

        bytes memory outdata;

        for (uint256 i; i < commands.length; i++) {
            success = true;
            command = commands[i];
            flags = uint256(uint8(bytes1(command)));
            commandType = flags & FLAG_CT_MASK;

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                indices = commands[i++];
            } else {
                indices = bytes32(uint256(command << 8) | SHORT_COMMAND_FILL);
            }

            if (commandType == FLAG_CT_PERMIT) {
                // state[state.length] = abi.encode(msg.sender);
                // (success, outdata) = permitPostAddress.call(state[0]);

                // bytes memory inputs = state.build(bytes4(0), indices);
                // (address some, address parameters, uint256 forPermit) = abi.decode(inputs, (address, address, uint));
                //
                // permitPost.permitWithNonce(msg.sender, some, parameters, forPermit);
            } else if (commandType == FLAG_CT_TRANSFER) {
                bytes memory inputs = state.buildInputs(indices);
                (
                  address token,
                  address payer,
                  address recipient,
                  uint256 value
                ) = abi.decode(inputs, (address, address, address, uint256));
                pay(token, payer, recipient, value);

            } else if (commandType == FLAG_CT_CHECK_AMT) {
                (uint256 amountA, uint256 amountB) = abi.decode(state.buildInputs(indices), (uint256, uint256));
                checkAmountGTE(amountA, amountB);
            } else if (commandType == FLAG_CT_V2SWAP) {
              bytes memory inputs = state.buildInputs(indices);
              (
                uint256 amountIn,
                uint256 amountOutMin,
                address[] memory path,
                address recipient
              ) = abi.decode(inputs, (uint256, uint256, address[], address));
              outdata = abi.encode(swapV2(amountIn, amountOutMin, path, recipient));
            } else {
                revert('Invalid calltype');
            }

            if (!success) {
                if (outdata.length > 0) {
                    assembly {
                        outdata := add(outdata, 68)
                    }
                }
                revert ExecutionFailed({
                    command_index: 0,
                    message: outdata.length > 0 ? string(outdata) : 'Unknown'
                });
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 56), outdata);
            } else {
                state = state.writeOutputs(bytes1(command << 56), outdata);
            }
        }

        return state;
    }

    function swapV2(uint256 amountIn, uint256 amountOutMin, address[] memory path, address recipient)
        internal
        returns (uint256 amountOut)
    {
      uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(recipient);
      for (uint256 i; i < path.length - 1; i++) {
          (address input, address output) = (path[i], path[i + 1]);
          (address token0, address token1) = input < output ? (input, output) : (output, input);
          IUniswapV2Pair pair = IUniswapV2Pair(getV2Pair(token0, token1));
          uint256 amountInput;
          uint256 amountOutput;
          // scope to avoid stack too deep errors
          {
              (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
              (uint256 reserveInput, uint256 reserveOutput) =
                  input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
              amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
              uint256 amountInWithFee = amountIn * 997;
              uint256 numerator = amountInWithFee * reserveOutput;
              uint256 denominator = reserveInput * 1000 + amountInWithFee;
              amountOutput = numerator / denominator;
          }
          (uint256 amount0Out, uint256 amount1Out) =
              input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
          address to = i < path.length - 2 ? getV2Pair(output, path[i + 2]) : recipient;
          pair.swap(amount0Out, amount1Out, to, new bytes(0));
          amountOut = IERC20(path[path.length - 1]).balanceOf(recipient) - balanceBefore;
          require(amountOut >= amountOutMin, 'Too little received');
      }
    }

    function getV2Pair(address token0, address token1) private pure returns (address) {
      return (
        address(
          uint160(
          uint256(
              keccak256(
                  abi.encodePacked(
                      hex'ff',
                      hex'5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f',
                      keccak256(abi.encodePacked(token0, token1)),
                      hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
                  )
              )
          ))
        )
      );
    }

    // could combine with enum for operation.
    function checkAmountGTE(uint256 a, uint256 b) private pure {
        if (a < b) revert NotGreaterOrEqual(a, b);
    }

    function checkAmountEQ(uint256 a, uint256 b) private pure {
        if (a != b) revert NotEqual(a, b);
    }

    function myNewFunction() external view returns (uint256 num) {
        return 5;
    }
}
