import '@typechain/hardhat'

import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-ethers'

import '@nomicfoundation/hardhat-chai-matchers'

import '@solarity/hardhat-migrate'

import "@nomicfoundation/hardhat-foundry";

import * as dotenv from 'dotenv'
dotenv.config()

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined

import { HardhatUserConfig } from 'hardhat/config'

const DEFAULT_COMPILER_SETTINGS = {
  version: '0.8.17',
  settings: {
    viaIR: true,
    evmVersion: 'istanbul',
    optimizer: {
      enabled: true,
      runs: 1_000_000,
    },
    metadata: {
      bytecodeHash: 'none',
    },
  },
}

declare module 'hardhat/types/config' {
  interface HardhatUserConfig {
    namedAccounts?: {
      deployer: number
    }
  }
}

const config: HardhatUserConfig = {
  paths: {
    sources: './contracts',
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
      // Comment out for tests
      chainId: 1,
      forking: {
        url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
        blockNumber: 15360000,
      },
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      gasMultiplier: 1.2
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      gasMultiplier: 1.2,
    },
    amoy: {
      url: `https://polygon-amoy.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      gasMultiplier: 1.2,
    },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      gasMultiplier: 1.2,
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      gasMultiplier: 1.2,
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    // Or at https://polygonscan.com/
    apiKey: {
      sepolia: `${process.env.ETHERSCAN_KEY}`,
      mainnet: `${process.env.ETHERSCAN_KEY}`,
      polygonAmoy: `${process.env.POLYGONSCAN_KEY}`,
      polygon: `${process.env.POLYGONSCAN_KEY}`,
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  solidity: {
    compilers: [DEFAULT_COMPILER_SETTINGS],
  },
  mocha: {
    timeout: 60000,
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
    alwaysGenerateOverloads: true,
    discriminateTypes: true,
  },
}

export default config