// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

/// @title RouteSigner
/// @notice Contract for managing signed execution context using transient storage
abstract contract RouteSigner is EIP712 {
    /// @notice Transient storage slot for the route signer address
    /// @dev Must equal TransientSlots.ROUTE_SIGNER; inline assembly only accepts a literal here
    bytes32 internal constant ROUTE_SIGNER_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000003;

    /// @notice Transient storage slot for the route intent
    /// @dev Must equal TransientSlots.ROUTE_INTENT
    bytes32 internal constant ROUTE_INTENT_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000004;

    /// @notice Transient storage slot for the route data
    /// @dev Must equal TransientSlots.ROUTE_DATA
    bytes32 internal constant ROUTE_DATA_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000005;

    /// @notice EIP712 typehash for signed execution
    bytes32 internal constant EXECUTE_SIGNED_TYPEHASH = keccak256(
        'ExecuteSigned(bytes commands,bytes[] inputs,bytes32 intent,bytes32 data,address sender,bytes32 nonce,uint256 deadline)'
    );

    /// @notice Mapping of used nonces for replay protection
    /// @dev Unordered nonces allow parallel execution of signed routes
    mapping(address user => mapping(bytes32 nonce => bool used)) public noncesUsed;

    /// @notice Thrown when a nonce has already been used
    error NonceAlreadyUsed();

    /// @dev Stores the signature context (signer, intent, data) in transient storage
    function _setSignatureContext(
        bytes calldata commands,
        bytes[] calldata inputs,
        bytes32 intent,
        bytes32 data,
        bool verifySender,
        bytes32 nonce,
        bytes calldata signature,
        uint256 deadline
    ) internal returns (address signer) {
        // Hash the inputs array per EIP712: hash each element, concatenate, then hash again
        uint256 inputsLength = inputs.length;
        bytes32[] memory inputHashes = new bytes32[](inputsLength);
        for (uint256 i = 0; i < inputsLength; ++i) {
            inputHashes[i] = keccak256(inputs[i]);
        }
        bytes32 inputsHash = keccak256(abi.encodePacked(inputHashes));

        // Determine sender for signature verification
        address sender = verifySender ? msg.sender : address(0);

        // Construct EIP712 hash
        bytes32 structHash = keccak256(
            abi.encode(EXECUTE_SIGNED_TYPEHASH, keccak256(commands), inputsHash, intent, data, sender, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        // Recover signer
        signer = ECDSA.recover(digest, signature);

        // Check and mark nonce as used (skip if nonce == bytes32(type(uint256).max))
        if (nonce != bytes32(type(uint256).max)) {
            if (noncesUsed[signer][nonce]) revert NonceAlreadyUsed();
            noncesUsed[signer][nonce] = true;
        }

        // Store signer, intent, and data in transient storage
        assembly ('memory-safe') {
            tstore(ROUTE_SIGNER_SLOT, signer)
            tstore(ROUTE_INTENT_SLOT, intent)
            tstore(ROUTE_DATA_SLOT, data)
        }
    }

    /// @dev Clears the signature context from transient storage
    function _resetSignatureContext() internal {
        assembly ('memory-safe') {
            tstore(ROUTE_SIGNER_SLOT, 0)
            tstore(ROUTE_INTENT_SLOT, 0)
            tstore(ROUTE_DATA_SLOT, 0)
        }
    }

    /// @dev Internal function to read signed route context from transient storage
    function _signedRouteContext() internal view returns (address signer, bytes32 intent, bytes32 data) {
        assembly ('memory-safe') {
            signer := tload(ROUTE_SIGNER_SLOT)
            intent := tload(ROUTE_INTENT_SLOT)
            data := tload(ROUTE_DATA_SLOT)
        }
    }
}
