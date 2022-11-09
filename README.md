# narwhal

## Usage

### To Run Integration Tests with Hardhat

1. Create `.env` file with api key

```
INFURA_API_KEY='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

2. Run yarn commands to compile and test

```console
yarn install
yarn symlink
yarn compile
yarn test
```

### To Run Forge Tests

```console
forge install
forge build
forge test
```

### To Deploy
```console
forge script \
--rpc-url <RPC-URL> \
--broadcast \
--private-key <RAW_PRIVATE_KEY> \
--sig 'run(address permit2,address routerRewardsDistributor,address looksRareRewardsDistributor,address looksRareToken,address v2Factory,address v3Factory,bytes32 pairInitCodeHash,bytes32 poolInitCodeHash)' \
scripts/DeployRouter.s.sol:DeployRouter \
<PERMIT2_ADDRESS> \
<ROUTER_REWARDS_DISTRIBUTOR_ADDRESS> \
<LOOKSRARE_REWARDS_DISTRIBUTOR_ADDRESS> \
<LOOKS_RARE_TOKEN_ADDRESS> \
<V2_FACTORY_ADDRESS> \
<V3_FACTORY_ADDRESS> \
<V2_PAIR_INIT_CODEHASH> \
<V3_POOL_INIT_CODEHASH> \
```

## Calldata Overview

### Router.execute parameters

#### `bytes calldata commands`

This bytes string contains 1 byte per command to be executed.

Each command is a `bytes1` containing the following 8 bits:

```
 0 1 2 3 4 5 6 7
┌─┬───┬─────────┐
│f│ r | command │
└─┴───┴─────────┘
```

- `f` is a single bit flag, that signals whether or not the command should be allowed to revert. If `f` is `false`, and the command reverts, then the entire transaction will revert.

- `r` is two bits of reserved space. This will easily allow us to increase the space used for commands, or add new flags in future.

- `command` is a 5 bit unique identifier for the command that should be carried out. The value that selects the corresponding call type is described in the table below:'

```
   ┌──────┬────────────────────┐
   │ 0x00 │  Permit            │
   ├──────┼────────────────────┤
   │ 0x01 │  Transfer          │
   ├──────┼────────────────────┤
   │ 0x02 │  V3ExactIn         │
   ├──────┼────────────────────┤
   │ 0x03 │  V3ExactOut        │
   ├──────┼────────────────────┤
   │ 0x04 │  V2ExactIn         │
   ├──────┼────────────────────┤
   │ 0x05 │  V2ExactOut        │
   ├──────┼────────────────────┤
   │ 0x06 │  Seaport           │
   ├──────┼────────────────────┤
   │ 0x07 │  WrapETH           │
   ├──────┼────────────────────┤
   │ 0x08 │  UnwrapWETH        │
   ├──────┼────────────────────┤
   │ 0x09 │  Sweep             │
   ├──────┼────────────────────┤
   │ 0x0a │  NFTX              │
   ├──────┼────────────────────┤
   │ 0x0b │  LooksRare721      │
   ├──────┼────────────────────┤
   │ 0x0c │  X2Y2721           │
   ├──────┼────────────────────┤
   │ 0x0d │  LooksRare1155     │
   ├──────┼────────────────────┤
   │ 0x0e │  X2Y21155          │
   ├──────┼────────────────────┤
   │ 0x0f │  Foundation        │
   ├──────┼────────────────────┤
   │ 0x10 │  SweepWithFee      │
   ├──────┼────────────────────┤
   │ 0x11 │  UnwrapWETHWithFee │
   ├──────┼────────────────────┤
   │ 0x12 │  Sudoswap          │
   └──────┴────────────────────┘
```

#### `bytes[] calldata inputs`

This array contains the abi encoded parameters to provide for each command.

The command located at `commands[i]` has its corresponding input parameters located at `inputs[i]`.
