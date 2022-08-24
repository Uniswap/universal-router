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

3. Or to run tests with local sdk, run these commands, then repeat step 2.
```console
# from inside narwhal-sdk repo run:
yarn link

# from inside narwhal repo run:
yarn link "@uniswap/narwhal-sdk"
```


### To Run Forge Tests
```console
forge install
forge build
forge test
```
