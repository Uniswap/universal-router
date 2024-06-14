# Universal Router

Please read the [Contributions](https://github.com/Uniswap/universal-router#contributions) section before submitting a Pull Request.

To see the commit of the smart contracts that was used in the latest deployment, see branch `deployed-commit`. To see the addresses of this latest deployment on each network, see folder `deploy-addresses`.

## High-Level Overview

The Universal Router is a ERC20 and NFT swap router that allows users greater flexibility when performing trades across multiple token types.

Our flexible command style allows us to provide users with:

- Splitting and interleaving of Uniswap trades
- Purchases of NFTs across 8 marketplaces
- Partial fills of trades
- Wrapping and Unwrapping of ETH
- Time-bound, signature controlled token approvals using [Permit2](https://github.com/Uniswap/permit2)

Transactions are encoded using a string of commands, allowing users to have maximum flexibility over what they want to perform. With all of these features available in a single transaction, the possibilities available to users are endless

## Contract Overview

The Universal Router codebase consists of the `UniversalRouter` contract, and all of its dependencies. The purpose of the `UniversalRouter` is to allow users to unify Uniswap ERC20 swaps (on V2 and V3) with NFT purchases across 8 marketplaces, in a single transaction.

`UniversalRouter` integrates with [Permit2](https://github.com/Uniswap/permit2), to enable users to have more safety, flexibility, and control over their ERC20 token approvals.

### UniversalRouter command encoding

Calls to `UniversalRouter.execute`, the entrypoint to the contracts, provide 2 main parameters:

- `bytes commands`: A bytes string. Each individual byte represents 1 command that the transaction will execute.
- `bytes[] inputs`: An array of bytes strings. Each element in the array is the encoded parameters for a command.

`commands[i]` is the command that will use `inputs[i]` as its encoded input parameters.

Through function overloading there is also an optional third parameter for the `execute` function:

- `uint256 deadline`: The timestamp deadline by which this transaction must be executed. Transactions executed after this specified deadline will revert.

#### How the command byte is structured

Each command is a `bytes1` containing the following 8 bits:

```
 0 1 2 3 4 5 6 7
┌─┬─┬───────────┐
│f│r|  command  │
└─┴─┴───────────┘
```

- `f` is a single bit flag, that signals whether or not the command should be allowed to revert. If `f` is `false`, and the command reverts, then the entire transaction will revert. If `f` is `true` and the command reverts then the transaction will continue, allowing us to achieve partial fills. If using this flag, be careful to include further commands that will remove any funds that could be left unused in the `UniversalRouter` contract.

- `r` is one bit of reserved space. This will allow us to increase the space used for commands, or add new flags in future.

- `command` is a 6 bit unique identifier for the command that should be carried out. The values of these commands can be found within Commands.sol, or can be viewed in the table below.

```
   ┌──────┬───────────────────────────────┐
   │ 0x00 │  V3_SWAP_EXACT_IN             │
   ├──────┼───────────────────────────────┤
   │ 0x01 │  V3_SWAP_EXACT_OUT            │
   ├──────┼───────────────────────────────┤
   │ 0x02 │  PERMIT2_TRANSFER_FROM        │
   ├──────┼───────────────────────────────┤
   │ 0x03 │  PERMIT2_PERMIT_BATCH         │
   ├──────┼───────────────────────────────┤
   │ 0x04 │  SWEEP                        │
   ├──────┼───────────────────────────────┤
   │ 0x05 │  TRANSFER                     │
   ├──────┼───────────────────────────────┤
   │ 0x06 │  PAY_PORTION                  │
   ├──────┼───────────────────────────────┤
   │ 0x07 │  -------                      │
   ├──────┼───────────────────────────────┤
   │ 0x08 │  V2_SWAP_EXACT_IN             │
   ├──────┼───────────────────────────────┤
   │ 0x09 │  V2_SWAP_EXACT_OUT            │
   ├──────┼───────────────────────────────┤
   │ 0x0a │  PERMIT2_PERMIT               │
   ├──────┼───────────────────────────────┤
   │ 0x0b │  WRAP_ETH                     │
   ├──────┼───────────────────────────────┤
   │ 0x0c │  UNWRAP_WETH                  │
   ├──────┼───────────────────────────────┤
   │ 0x0d │  PERMIT2_TRANSFER_FROM_BATCH  │
   ├──────┼───────────────────────────────┤
   │ 0x0e-│  -------                      │
   │ 0x20 │                               │
   ├──────┼───────────────────────────────┤
   │ 0x21 │  EXECUTE_SUB_PLAN             │
   ├──────┼───────────────────────────────┤
   │ 0x22-│  -------                      │
   │ 0x3f │                               │
   └──────┴───────────────────────────────┘
```

Note that some of the commands in the middle of the series are unused. These gaps allowed us to create gas-efficiencies when selecting which command to execute.

#### How the input bytes are structures

Each input bytes string is merely the abi encoding of a set of parameters. Depending on the command chosen, the input bytes string will be different. For example:

The inputs for `V3_SWAP_EXACT_IN` is the encoding of 5 parameters:

- `address` The recipient of the output of the trade
- `uint256` The amount of input tokens for the trade
- `uint256` The minimum amount of output tokens the user wants
- `bytes` The UniswapV3 path you want to trade along
- `bool` A flag for whether the input funds should come from the caller (through Permit2) or whether the funds are already in the UniversalRouter

Whereas in contrast `CRYPTOPUNKS` has just 3 parameters encoded:

- `uint256` The ID of the punk you wish to purchase
- `address` The recipient of the punk
- `uint256` The amount of ETH to pay for the punk

Encoding parameters in a bytes string in this way gives us maximum flexiblity to be able to support many commands which require different datatypes in a gas-efficient way.

For a more detailed breakdown of which parameters you should provide for each command take a look at the `Dispatcher.dispatch` function, or alternatively at the `ABI_DEFINITION` mapping in `planner.ts`.

Developer documentation to give a detailed explanation of the inputs for every command will be coming soon!

## Usage

### To Compile and Run Tests

1. Clone the repository with all submodules

Clone the repository with:
```
git clone --recurse-submodules https://github.com/Uniswap/universal-router.git
```

2. Create `.env` file with api key

```
INFURA_API_KEY='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

3. Run yarn commands to compile and test

### To Run Hardhat Tests

```console
yarn install
yarn compile
yarn test
```

If you run into an issue on `yarn compile` where it cannot find the dependencies in the lib folder try to clone all the submodules with:
```
git submodule update --init --recursive
```

#### To Update Hardhat Gas Snapshots

```console
yarn test:gas
```

### To Run Forge Tests

```console
forge install
forge build
forge test
```
## Integrating

1. Install the latest version of `@uniswap/universal-router` package.
2. Add git submodules for contracts that aren't a node package. Make sure there's an empty `.gitmodules` file. Then run:
    ```bash
      git submodule add https://github.com/transmissions11/solmate
      git submodule add https://github.com/Uniswap/permit2
    ```
3. You should now be able to import contracts from universal-router and compile.

## Contributions
Before you submit your PR, run all of the following and commit the changes:
```bash
# make sure all tests pass this will also update gas snapshots
yarn test:all

# lint code
yarn prettier:fix
```

If you are only concerned with investigating gas diffs, you can run this command to only run gas tests
```bash
yarn test:gas
```

### To Deploy

Fill out parameters in `script/deployParameters/Deploy<network>.s.sol`

```console
forge script --broadcast \
--rpc-url <RPC-URL> \
--private-key <PRIVATE_KEY> \
--sig 'run()' \
script/deployParameters/Deploy<network>.s.sol:Deploy<network>
```

### To Deploy and Verify

```console
forge script --broadcast \
--rpc-url <RPC-URL> \
--private-key <PRIVATE-KEY> \
--sig 'run()' \
script/deployParameters/Deploy<network>.s.sol:Deploy<network> \
--etherscan-api-key <ETHERSCAN-API-KEY> \
--verify
```

#### To Deploy Permit2 Alongside UniversalRouter

Fill out parameters in `scripts/deployParameters/<network>.json`

```console
forge script --broadcast \
--rpc-url <RPC-URL> \
--private-key <PRIVATE_KEY> \
--sig 'runAndDeployPermit2(string)' \
script/deployParameters/DeployUniversalRouter.s.sol:DeployUniversalRouter \
<pathToJSON>
```
