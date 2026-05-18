# Aggregator Hook Test Suite

Tests proving Universal Router can route swaps for legacy AMMs (V2, V3, etc.) through V4's `V4_SWAP` command against aggregator hooks. The capability already exists in UR's bytecode (V4Router is hook-agnostic) — these tests prove it works end-to-end before the V2-specific module is deleted.

## Why these tests exist

UR is at the EIP-170 24KB contract size limit. The V2 swap module (`V2SwapRouter.sol` + `UniswapV2Library.sol` + V2-specific dispatch + V2 immutables) is the largest immediately-deletable chunk: ~1.5KB recovery. Before deleting it, we must prove that the equivalent flow works via the V4 path against the `UniswapV2Aggregator` hook from [v4-hooks-public](https://github.com/Uniswap/v4-hooks-public).

See the implementation plan and proof of coverage in `.claude-output/` at the repo root.

## Directory layout

```
aggregators/
├── README.md                              ← this file
├── _AggregatorBase.t.sol                  ← shared base: fork setup, tokens, hook deploy, plan encoder
└── v2/
    ├── V2AggregatorMatrix.t.sol           ← the 24-cell matrix (Position × Role × Direction)
    └── mocks/
        └── UniswapV2AggregatorMock.sol    ← in-tree mock mirroring v4-hooks-public's hook
```

## Why an in-tree mock instead of the production hook

`UniswapV2Aggregator` in v4-hooks-public is pinned to `pragma solidity 0.8.29`; UR is on `0.8.26`. The cleanest cross-pragma options are:

1. **Submodule v4-hooks-public + protocol-fees** → drags 5+ transitive submodules onto UR for test-only deps.
2. **Precompile + assembly create2** → opaque; tests can't easily extend hook behavior.
3. **In-tree mock with the same swap mechanics** → ← we picked this.

The mock at `v2/mocks/UniswapV2AggregatorMock.sol` mirrors v4-hooks-public's `UniswapV2Aggregator` behaviorally:

- Permission flags: `beforeInitialize | beforeAddLiquidity | beforeSwap | beforeSwapReturnsDelta`
- `_swapOnPair` flow: `sync(out) → take(in, pair) → pair.swap → settle` (identical to production)
- Returns the same shape of `BeforeSwapDelta` to absorb the swapper's intent and produce the V2 output
- Rejects native ETH currency (`NativeCurrencyNotSupported`)
- Reverts on `beforeAddLiquidity` (`LiquidityNotAllowed`) — pure aggregator
- Enforces one-PoolKey-per-V2-pair via `PairAlreadyHasCanonicalPool`

Intentionally omitted from the mock (out of scope for routing-correctness tests):
- `IFeeClassifiedHook` / `ProtocolFees` / token-jar wiring
- `pollTokenJar()` administrative surface

Because the mock is in-tree, tests can:
- Add custom events / introspection (e.g., observe internal call ordering)
- Override `_swapOnPair` for edge-case fuzzing
- Vary constructor args without rebuilding precompiles

When parity to a specific v4-hooks-public commit becomes important (e.g., the audit-pinned version), this directory will also pull in the canonical bytecode via a fork test that compares deployed code hashes.

## Hook address derivation

The mock is deployed via `CREATE2` from the test contract. `_AggregatorBase._mineHookSalt` brute-forces a salt whose deployed address has its lower 14 bits matching `V2_AGGREGATOR_HOOK_FLAGS`. The deployed `aggregatorHook` instance therefore satisfies v4-core's `Hooks.validateHookPermissions` and slots into a real `PoolKey` interchangeably with a production hook deployment.

## The 24-cell matrix

Each cell tests a (Position × Token Role × Direction) combination:

- **Position:** Beginning / Middle / End of the multi-hop route
- **Token Role:** V2-only INPUT / V2-only OUTPUT (under V2-only assumption), or V2-Mostly variants
- **Direction:** Exact-in / Exact-out

Cells expected to SUCCEED route via:
- (Beginning, V2-only Input): `SETTLE(X) → SWAP(v2AggKey) → TAKE(Y)`
- (End, V2-only Output): `SETTLE(in) → SWAP(v4) → SWAP(v2AggKey) → TAKE(V2-only)`
- All V2-Mostly cells: PM's aggregate balance from V4 pool reserves backs the V2 hop

Cells expected to REVERT all fail at the same site — `Pool.PoolNotInitialized()` (selector `0x486aa307`) inside V4-core's `Pool.sol`. Tests assert this exact selector.

## Running

```sh
# Full matrix (requires FORK_URL env var)
forge test --match-path "test/foundry-tests/aggregators/v2/**" --fork-url $FORK_URL

# Single cell
forge test --match-test test_v2Agg_beginning_exactIn_v2OnlyInput_success -vvv --fork-url $FORK_URL

# Gas snapshots
forge test --match-path "test/foundry-tests/aggregators/v2/gas/**" --gas-report --fork-url $FORK_URL
```

Fork pin: Ethereum mainnet block `23_000_000` (matches the existing `ChainedActionsFork` suite). See `_AggregatorBase.FORK_BLOCK`.
