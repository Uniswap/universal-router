// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

struct AcrossV4DepositV3Params {
    address spokePool; // SpokePool on origin chain
    address depositor; // credited depositor
    address recipient; // destination recipient
    address inputToken; // ERC20 on origin (WETH if bridging ETH)
    address outputToken; // ERC20 on destination (or 0x0)
    uint256 inputAmount;
    uint256 outputAmount;
    uint256 destinationChainId;
    address exclusiveRelayer; // 0x0 if no exclusivity
    uint32 quoteTimestamp;
    uint32 fillDeadline;
    uint32 exclusivityDeadline;
    bytes message;
    bool useNative; // if true, call is payable with value=inputAmount (inputToken must be WETH)
}

interface IUniversalRouter {
    /// @notice Thrown when a required command has failed
    error ExecutionFailed(uint256 commandIndex, bytes message);

    /// @notice Thrown when attempting to send ETH directly to the contract
    error ETHNotAccepted();

    /// @notice Thrown when executing commands with an expired deadline
    error TransactionDeadlinePassed();

    /// @notice Thrown when attempting to execute commands and an incorrect number of inputs are provided
    error LengthMismatch();

    // @notice Thrown when an address that isn't WETH tries to send ETH to the router without calldata
    error InvalidEthSender();

    /// @notice Executes encoded commands along with provided inputs. Reverts if deadline has expired.
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}
