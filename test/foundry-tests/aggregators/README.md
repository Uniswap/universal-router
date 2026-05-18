# Aggregator Hook Test Suite

Tests proving Universal Router can route swaps for legacy AMMs (V2, V3, etc.) through V4's `V4_SWAP` command against aggregator hooks. The capability already exists in UR's bytecode (V4Router is hook-agnostic) — these tests prove it works end-to-end before the V2-specific module is deleted.

## Why these tests exist

UR is at the EIP-170 24KB contract size limit. The V2 swap module (`V2SwapRouter.sol` + `UniswapV2Library.sol` + V2-specific dispatch + V2 immutables) is the largest immediately-deletable chunk: ~1.5KB recovery. Before deleting it, we must prove that the equivalent flow works via the V4 path against the `UniswapV2Aggregator` hook from [v4-hooks-public](https://github.com/Uniswap/v4-hooks-public).

See the implementation plan and proof of coverage in the `.claude-output/` directory of the repo root.

## Directory layout

```
aggregators/
├── README.md                          ← this file
├── _AggregatorBase.t.sol              ← shared base: fork setup, tokens, hook deploy, plan encoder
└── v2/
    ├── V2AggregatorMatrix.t.sol       ← the 24-cell matrix (Position × Role × Direction)
    ├── interfaces/
    │   └── IUniswapV2Aggregator.sol   ← minimal interface for cross-pragma calls
    └── precompile/
        └── UniswapV2Aggregator.bin    ← creation bytecode from v4-hooks-public
```

## Hook deployment pattern

`UniswapV2Aggregator` in v4-hooks-public is pinned to `pragma solidity 0.8.29`. UR is pinned to `0.8.26`. To avoid a cross-version compilation mess, we use the **precompile pattern**:

1. The hook's creation bytecode is committed at `v2/precompile/UniswapV2Aggregator.bin` (extracted from `v4-hooks-public/foundry-out/UniswapV2Aggregator.sol/UniswapV2Aggregator.json`).
2. `_AggregatorBase.deployV2Aggregator(...)` reads the file via `vm.readFile`, appends abi-encoded constructor args, mines a salt for the hook's permission-flag address pattern, and deploys via `CREATE2`.
3. Tests interact with the hook via the minimal `IUniswapV2Aggregator` interface in `v2/interfaces/`.

To regenerate the precompile after a hook update:

```sh
cd $V4_HOOKS_PUBLIC_REPO && forge build
python3 -c "import json; print(json.load(open('foundry-out/UniswapV2Aggregator.sol/UniswapV2Aggregator.json'))['bytecode']['object'])" \
  | tr -d '\n' \
  > $UR_REPO/test/foundry-tests/aggregators/v2/precompile/UniswapV2Aggregator.bin
```

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

Fork pin: Ethereum mainnet block `22_500_000`. See `_AggregatorBase.FORK_BLOCK`.
