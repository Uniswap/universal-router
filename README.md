# narwhal

## Usage
### To Run Integration Tests with Hardhat
1. Create `.env` file with api key
```
INFURA_API_KEY='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

2. Run yarn commands and tests should work
```console
yarn install
yarn compile
yarn test
```

3. Or to run tests with local sdk, run these commands.
```console
# from inside narwhal-sdk repo run:
yarn link

# from inside narwhal repo run:
yarn link "@uniswap/narwhal-sdk"
yarn test

# if there are any changes to narwhal-sdk, you must rebuild to import those changes to linked repo
# on any changes to the sdk, from inside narwhal-sdk repo run:
yarn build
```


### To Run Forge Tests
```console
forge install
forge build
forge test
```

## Weiroll Overview

The Weiroll structure for narwhal has been adapted from the original [Weiroll](https://github.com/weiroll/weiroll)

The input to the Weiroll VM is a bytestring of encoded commands and an array of state variables. The Weiroll VM executes the list of commands from start to finish.

State elements are `bytes` values of arbitrary length. The VM supports up to 127 state elements.

Commands are `bytes8` values that encode a single operation for the VM to take. Each operation consists of taking zero or more state elements and using them to call the function specified in the command. The return value(s) of the function are then unpacked back into the state.

This simple architecture makes it possible for the output of one operation to be used as an input to any other, as well as allowing static values to be supplied by specifying them as part of the initial state.

## Command structure

Each command is a `bytes8` containing the following fields (MSB first):

```         
 0 1 2 3 4 5 6 7 
┌─┬───────────┬─┐
│f│    in     │o│
└─┴───────────┴─┘
```
 - `f` is a flags byte that specifies calltype, and whether this is an extended command
 - `in` is an array of 1-byte argument specifications described below, for the input arguments
 - `o` is the 1-byte argument specification described below, for the return value

### Flags

The 1-byte flags argument `f` has the following field structure:

```
  0   1    2   3   4   5   6   7
┌───┬───┬────────┬──────────────┐
│tup│ext│reserved│  calltype    │
└───┴───┴────────┴──────────────┘
```

If `tup` is set, the return for this command will be assigned to the state slot directly, without any attempt at processing or decoding.

The `ext` bit signifies that this is an extended command, and as such the next command should be treated as 32-byte `in` list of indices, rather than the 6-byte list in the packed command struct.

Bits 2-5 are reserved for future use.

The 4-bit `calltype` is treated as a `uint16` that specifies the type of call. The value that selects the corresponding call type is described in the table below:

```
   ┌──────┬───────────────────┐
   │ 0x00 │  Permit           │
   ├──────┼───────────────────┤
   │ 0x01 │  Transfer         │
   ├──────┼───────────────────┤
   │ 0x02 │  V3ExactIn        │
   ├──────┼───────────────────┤
   │ 0x03 │  V3ExactOut       │
   └──────┴───────────────────┘
   ..and so on (will fill in later as likely to change)
```

### Input/output list (in/o) format


Each 1-byte argument specifier value describes how each input or output argument should be treated, and has the following fields (MSB first):

```
  0   1   2   3   4   5   6   7
┌───┬───────────────────────────┐
│var│           idx             │
└───┴───────────────────────────┘
```

The `var` flag indicates if the indexed value should be treated as fixed- or variable-length. If `var == 0b0`, the argument is fixed-length, and `idx`, is treated as the index into the state array at which the value is located. The state entry at that index must be exactly 32 bytes long.

If `var == 0b10000000`, the indexed value is treated as variable-length, and `idx` is treated as the index into the state array at which the value is located. The value must be a multiple of 32 bytes long.

The vm handles the "head" part of ABI-encoding and decoding for variable-length values, so the state elements for these should be the "tail" part of the encoding - for example, a string encodes as a 32 byte length field followed by the string data, padded to a 32-byte boundary, and an array of `uint`s is a 32 byte count followed by the concatenation of all the uints.

There are two special values `idx` can equal to which modify the encoder behavior, specified in the below table:

```
   ┌──────┬───────────────────┐
   │ 0xfe │  USE_STATE        │
   ├──────┼───────────────────┤
   │ 0xff │  END_OF_ARGS      │
   └──────┴───────────────────┘
```

If `idx` equals `USE_STATE` inside of an `in` list byte, then the parameter at that position is constructed by feeding the entire state array into `abi.encode` and passing it to the function as a single argument. If it's specified as part of the `o` output target, then the output of that command is written directly to the state instead via `abi.decode`.

The special `idx` value `END_OF_ARGS` indicates the end of the parameter list, no encoding action will be taken, and all further bytes in the list will be ignored. If the first byte in the input list is `END_OF_ARGS`, then the function will be called with no parameters. If `o` equals `END_OF_ARGS`, then it specifies that the command's return should be ignored.

