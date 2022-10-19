// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';

interface IRouter is IERC721Receiver, IERC1155Receiver {
    /// @notice Thrown when a required command has failed
    error ExecutionFailed(uint256 commandIndex, bytes message);

    /// @notice Thrown when attempting to send ETH directly to the contract
    error ETHNotAccepted();

    /// @notice Thrown executing commands with an expired deadline
    error TransactionDeadlinePassed();

    /// @notice Thrown executing commands with an expired deadline
    error LengthMismatch();

    /// @notice Executes encoded commands along with provided inputs. Reverts if deadline has expired.
    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param inputs The state elements that should be used for the input and output of commands
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;

    /// @notice Executes encoded commands along with provided inputs.
    /// @param commands A set of concatenated commands, each 8 bytes in length
    /// @param inputs The state elements that should be used for the input and output of commands
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable;
}
