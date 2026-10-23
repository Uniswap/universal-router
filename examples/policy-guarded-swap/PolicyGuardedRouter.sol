// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  PolicyGuardedRouter — wrapping pattern reference
/// @author Community contribution (B2JK-Industry / SBO3L)
/// @notice Demonstrates the per-command policy-gating pattern for
///         Universal Router multicalls. Designed for autonomous-agent
///         use cases where an off-chain policy engine evaluates each
///         command in a multicall sequence independently, with
///         abort-on-first-deny semantics.
///
/// @dev    This is a REFERENCE example illustrating the on-chain
///         wrapper shape. The actual policy decisions live off-chain
///         (in an agent's policy engine, e.g. SBO3L's GuardedExecutor)
///         and are committed via signed receipts before the multicall
///         is broadcast. This contract is the on-chain view: it
///         re-checks the receipt's commitment matches the multicall
///         payload (so an attacker can't swap the bytes between
///         off-chain decision and on-chain landing) and forwards to
///         Universal Router.
///
///         Full Rust off-chain implementation:
///         B2JK-Industry/SBO3L-ethglobal-openagents-2026
///           crates/sbo3l-execution/src/uniswap_router.rs
///
/// @custom:non-canonical This contract is illustrative; production
///         deployments should integrate with their existing receipt
///         signing scheme (ECDSA / Ed25519 / EIP-712) and policy
///         hash anchor.

interface IUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

contract PolicyGuardedRouter {
    /// @notice The Universal Router this wrapper forwards to. Pinned
    ///         at deploy time; immutable.
    IUniversalRouter public immutable router;

    /// @notice The off-chain policy engine's signing address.
    ///         Multicalls are admitted only if the supplied receipt
    ///         was signed by this signer over the multicall's
    ///         commitment digest.
    address public immutable policySigner;

    /// @notice Emitted on every successful policy-guarded multicall.
    ///         `evidenceDigest` binds (commands, inputs, deadline,
    ///         receipt-anchor) so an auditor can reconstruct the
    ///         decision off-chain.
    event PolicyGuardedExecute(
        address indexed caller,
        bytes32 indexed evidenceDigest,
        bytes32 receiptAnchor
    );

    error InvalidPolicySignature();
    error ReceiptCommitmentMismatch();
    error DeadlinePassed();

    constructor(address router_, address policySigner_) {
        router = IUniversalRouter(router_);
        policySigner = policySigner_;
    }

    /// @notice Execute a Universal Router multicall iff the supplied
    ///         policy receipt's commitment matches the multicall
    ///         payload AND the receipt was signed by `policySigner`.
    ///
    /// @param  commands       Standard UR commands byte string.
    /// @param  inputs         Standard UR inputs array.
    /// @param  deadline       Standard UR deadline.
    /// @param  receiptAnchor  Hash of the off-chain audit-chain
    ///                        position the policy decision was
    ///                        anchored at. The receipt contained an
    ///                        `audit_root` text record value (see
    ///                        ENSIP-26 if you've published agent
    ///                        identity) — this anchor is its keccak.
    /// @param  signature      ECDSA(r || s || v) over
    ///                        `keccak256(commands || inputs || deadline || receiptAnchor)`.
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline,
        bytes32 receiptAnchor,
        bytes calldata signature
    ) external payable {
        if (block.timestamp > deadline) revert DeadlinePassed();

        // The evidence digest binds every byte the policy decision
        // saw + the audit-chain anchor. If a malicious operator
        // tries to substitute even one byte of `inputs` between the
        // off-chain decision and the on-chain landing, the digest
        // changes, the signature fails, and the multicall reverts.
        bytes32 evidenceDigest = keccak256(
            abi.encodePacked(
                hex"19",          // EIP-191 prefix-byte
                hex"00",          // version 0 — generic intent
                address(this),    // bind to this wrapper
                block.chainid,    // bind to this chain
                commands,
                _hashInputs(inputs),
                deadline,
                receiptAnchor
            )
        );

        // EIP-191 personal-message style: prepend
        // "\x19Ethereum Signed Message:\n32" to the digest before
        // recovery.
        bytes32 ethSignedDigest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", evidenceDigest)
        );

        if (_recover(ethSignedDigest, signature) != policySigner) {
            revert InvalidPolicySignature();
        }

        emit PolicyGuardedExecute(msg.sender, evidenceDigest, receiptAnchor);

        // Forward to the canonical Universal Router. msg.value passes
        // through; the user's ETH is escrowed for the duration of
        // the multicall and refunded by UR's internal sweep if the
        // input commands don't consume it all.
        router.execute{value: msg.value}(commands, inputs, deadline);
    }

    /// @dev Hash a `bytes[]` array so it can participate in the
    ///      evidence digest. A naive `keccak256(abi.encode(inputs))`
    ///      would also work, but per-element hashing makes the
    ///      digest construction match the off-chain policy engine's
    ///      iterative-decode pattern more closely.
    function _hashInputs(bytes[] calldata inputs)
        internal
        pure
        returns (bytes32)
    {
        bytes32[] memory leafHashes = new bytes32[](inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            leafHashes[i] = keccak256(inputs[i]);
        }
        return keccak256(abi.encodePacked(leafHashes));
    }

    /// @dev ECDSA recovery for a 65-byte (r, s, v) signature.
    function _recover(bytes32 digest, bytes calldata sig)
        internal
        pure
        returns (address)
    {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
