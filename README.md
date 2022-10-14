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
yarn compile
yarn test
```

### To Run Forge Tests
```console
forge install
forge build
forge test
```

## Calldata Overview

### Router.execute parameters

#### `bytes memory commands`

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
- `command` is a 5 bit unique identifier for the command that should be carried out.


#### `bytes[] memory inputs`

This array contains the abi encoded parameters to provide for each command.

The command located at `commands[i]` has its corresponding input parameters located at `inputs[i]`.
