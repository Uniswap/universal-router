// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

struct AcrossV4DepositV3Params {
    address spokePool; // SpokePool on origin chain
    address depositor; // credited depositor
    address recipient; // destination recipient
    address inputToken; // ERC20 on origin (WETH if bridging ETH)
    address outputToken; // ERC20 on destination (or 0x0)
    uint256 inputAmount; // supports ActionConstants.CONTRACT_BALANCE to use contract's entire balance
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

    /// @notice Executes encoded commands with EIP712 signature verification
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    /// @param intent Application-specific intent identifier
    /// @param data Application-specific data
    /// @param verifySender If true, the signature must include msg.sender; if false, uses address(0)
    /// @param nonce Unordered nonce for replay protection. Use bytes32(type(uint256).max) to skip nonce check
    /// @param signature EIP712 signature authorizing the execution
    /// @param deadline The deadline by which the transaction must be executed
    /// @dev The signer, intent, and data are recovered/stored in transient storage for the duration of execution.
    /// All commands (including nested sub-commands via EXECUTE_SUB_PLAN) are covered by the signature.
    /// The signer, intent, and data can be accessed by commands via signedRouteContext().
    /// External reentrancy is prevented by the isNotLocked modifier on execute(). Internal reentrancy via
    /// EXECUTE_SUB_PLAN is safe as those sub-commands are part of the signed message. There is no way to change
    /// the signer mid-execution as executeSigned cannot be called internally.
    function executeSigned(
        bytes calldata commands,
        bytes[] calldata inputs,
        bytes32 intent,
        bytes32 data,
        bool verifySender,
        bytes32 nonce,
        bytes calldata signature,
        uint256 deadline
    ) external payable;

    /// @notice Returns all signed execution context (signer, intent, data) in a single call
    /// @return signer The address that signed the current execution, or address(0) if not in a signed execution
    /// @return intent The intent value from the signed execution, or bytes32(0) if not in a signed execution
    /// @return data The data value from the signed execution, or bytes32(0) if not in a signed execution
    /// @dev This reads from transient storage which is only set during executeSigned().
    /// @dev When consuming this context from a hook, the hook MUST verify that msg.sender is the
    /// UniversalRouter contract. Otherwise, a malicious contract in the execution chain could abuse the
    /// legitimate signed context by calling other contracts with it, causing unintended side effects.
    function signedRouteContext() external view returns (address signer, bytes32 intent, bytes32 data);
}
