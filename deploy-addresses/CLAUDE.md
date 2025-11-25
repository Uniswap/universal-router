# Deployment Addresses

## Overview

This directory contains JSON files with deployed Universal Router contract addresses for each supported network. Each file maps contract names to their deployed addresses on a specific blockchain.

## Networks

**Mainnet:**
- `mainnet.json` - Ethereum mainnet
- `arbitrum.json` - Arbitrum One
- `optimism.json` - Optimism
- `polygon.json` - Polygon PoS
- `base.json` - Base
- `avalanche.json` - Avalanche C-Chain
- `bsc.json` - BNB Smart Chain
- `celo.json` - Celo
- `blast.json` - Blast
- `zora.json` - Zora
- `ink.json` - Ink
- `soneium.json` - Soneium
- `worldchain.json` - Worldchain
- `unichain.json` - Unichain

**Testnet:**
- `sepolia.json` - Sepolia
- `goerli.json` - Goerli (deprecated)
- `base-sepolia.json` - Base Sepolia
- `base-goerli.json` - Base Goerli (deprecated)
- `op-sepolia.json` - Optimism Sepolia
- `optimism-goerli.json` - Optimism Goerli (deprecated)
- `arbitrum-goerli.json` - Arbitrum Goerli (deprecated)
- `polygon-mumbai.json` - Polygon Mumbai (deprecated)
- `celo-alfajores.json` - Celo Alfajores
- `unichain-sepolia.json` - Unichain Sepolia

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
