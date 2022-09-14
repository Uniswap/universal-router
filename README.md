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
