# Policy-guarded swap pattern for autonomous agents

> **What this example demonstrates:** how an autonomous-agent
> middleware (e.g. an off-chain policy engine) can wrap Universal
> Router calls so each command in a multicall is independently
> policy-evaluated, with abort-on-first-deny semantics + audit
> evidence capture. Reference implementation:
> [`B2JK-Industry/SBO3L-ethglobal-openagents-2026`](https://github.com/B2JK-Industry/SBO3L-ethglobal-openagents-2026/blob/main/crates/sbo3l-execution/src/uniswap_router.rs).

## Why this matters for autonomous-agent use cases

Universal Router transactions are **multicall sequences**. One tx
can chain `PERMIT2 → V3_SWAP_EXACT_IN → SWEEP → UNWRAP_WETH`,
each command with its own parameters and its own policy-relevant
decisions (counterparty, slippage, recipient, ...).

For an autonomous agent operating on behalf of a user, a naïve
"policy-gated" wrapper would evaluate the *whole* multicall with
one decision and either approve or deny in bulk. That misses the
point: a malicious or buggy agent could sneak a `SWEEP → 0xevil`
past a swap-only gate that only inspects the V3_SWAP leg.

The right pattern is **per-command** policy evaluation:

1. Decode the multicall into individual commands.
2. For each command, in order, ask the policy engine to decide
   based on that command's parameters.
3. The first command that denies aborts the *whole* multicall —
   later commands are not evaluated, no tx is broadcast, and the
   audit evidence records both the deny reason and the
   `aborted_at_index`.
4. If every command allows, the multicall is approved as a whole.

## Reference implementation (off-chain)

The SBO3L project ships a working implementation of this pattern
in Rust at
[`crates/sbo3l-execution/src/uniswap_router.rs`](https://github.com/B2JK-Industry/SBO3L-ethglobal-openagents-2026/blob/main/crates/sbo3l-execution/src/uniswap_router.rs).
Key shape:

- Decode the `(commands bytes, inputs bytes[])` pair into a
  `Vec<UniversalRouterCommand>` enum (`PERMIT2_PERMIT`,
  `V3_SWAP_EXACT_IN`, `SWEEP`, `UNWRAP_WETH`, etc.).
- Call the policy engine per-command. Each command carries
  decoded parameters (token, amount, recipient) the engine
  inspects.
- On first deny, abort and emit `executor_evidence` of shape:

  ```json
  {
    "router_address": "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    "router_version": "v2",
    "command_sequence": [
      { "op": "PERMIT2_PERMIT", "params": { ... }, "decision": "allow" },
      { "op": "V3_SWAP_EXACT_IN", "params": { ... }, "decision": "allow" },
      { "op": "SWEEP", "params": { "recipient": "0xevil…" }, "decision": "deny", "deny_code": "policy.recipient_blocklist" }
    ],
    "aborted_at_index": 2,
    "aborted_reason": "policy.recipient_blocklist"
  }
  ```

- The evidence is signed (Ed25519 in SBO3L's case, but any
  agent-side signing scheme works) and committed to an
  append-only audit chain so a third party can replay the
  decision later.

## Why this matters for the Universal Router community

Most autonomous-agent / "agentic DeFi" implementations today
either:

1. **Sign opaque multicalls** — the user's signing key is a
   single-shot rubber-stamp; granular safety isn't possible.
2. **Use bespoke pre-flight checks** — implementations diverge,
   each project re-implements the policy boundary.
3. **Skip policy entirely** — the agent has direct execution
   authority; the user trusts the agent unconditionally.

A standardised pattern + reference impl means agentic apps can
ship a per-command policy boundary without reinventing the
decoder + evidence shape. Universal Router is well-positioned to
host this guidance because:

- Its multicall surface is the canonical multi-step DeFi flow.
- Its command opcodes are stable (changes happen via versioned
  routers, not in-place).
- A documented per-command policy hook composes with existing
  audit / monitoring tooling without contract changes.

## Counterfactual: V3_SWAP_EXACT_IN-only gate

What happens if you gate ONLY the swap leg and not the sweep?

```
[PERMIT2_PERMIT, V3_SWAP_EXACT_IN(USDC → WETH), SWEEP(recipient=0xevil)]
```

A swap-only gate looks at command 1 (swap is fine — user's tokens
moving to user's WETH balance), approves, and the SWEEP command
fires. Result: USDC → WETH → WETH-sent-to-attacker. This is the
attack the per-command pattern prevents.

## Where this fits in the Universal Router repo

This `examples/` directory is a **community-contributed reference
pattern**. It's not part of the canonical Universal Router
contracts, doesn't ship with the deployed bytecode, and doesn't
require any changes to the core router. It's purely educational +
points readers at a working implementation they can study or
adopt.

If the Universal Router maintainers prefer this content lives
elsewhere (a separate `examples` repo, the docs site, or a wiki
page), happy to relocate. Goal is to document the pattern so the
agentic-DeFi community can converge on a consistent
policy-boundary shape.

## Other reference patterns in the wild

- **SBO3L UniswapRouterExecutor** ([`crates/sbo3l-execution/src/uniswap_router.rs`](https://github.com/B2JK-Industry/SBO3L-ethglobal-openagents-2026/blob/main/crates/sbo3l-execution/src/uniswap_router.rs))
  — Rust, async/tokio, alloy-based, full implementation with
  evidence-chain integration.
- **SBO3L policy engine** ([`crates/sbo3l-policy/`](https://github.com/B2JK-Industry/SBO3L-ethglobal-openagents-2026/tree/main/crates/sbo3l-policy))
  — JCS-canonicalised policy snapshot, ENS-anchored policy hash,
  receipt signing.

## Discussion

Open to feedback on:

- Whether the per-command pattern should be canonicalised in this
  repo or in a separate "Universal Router agentic patterns" repo.
- Whether the evidence shape (`command_sequence`, `aborted_at_index`)
  should be standardised, or left implementation-specific.
- Whether ERC-4337-style account-abstraction wallets should
  surface this hook natively (vs always going through an external
  policy engine).
