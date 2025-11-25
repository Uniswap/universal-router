# Deployment Parameter Scripts

## Overview

This directory contains Foundry scripts that define network-specific deployment parameters for the Universal Router. Each script provides the RouterParameters configuration for a specific blockchain network.

## Networks

**Mainnet Scripts:**
- `DeployMainnet.s.sol` - Ethereum mainnet
- `DeployArbitrum.s.sol` - Arbitrum One
- `DeployOptimism.s.sol` - Optimism
- `DeployPolygon.s.sol` - Polygon PoS
- `DeployBase.s.sol` - Base
- `DeployAvalanche.s.sol` - Avalanche
- `DeployBSC.s.sol` - BNB Smart Chain
- `DeployCelo.s.sol` - Celo
- `DeployBlast.s.sol` - Blast
- `DeployZora.s.sol` - Zora
- `DeployInk.s.sol` - Ink
- `DeploySoneium.s.sol` - Soneium
- `DeployWorldchain.s.sol` - Worldchain
- `DeployUnichain.s.sol` - Unichain

**Testnet Scripts:**
- `DeploySepolia.s.sol`, `DeployGoerli.s.sol`, `DeployBaseSepolia.s.sol`, `DeployBaseGoerli.s.sol`, `DeployOPSepolia.s.sol`, `DeployOptimismGoerli.s.sol`, `DeployArbitrumGoerli.s.sol`, `DeployPolygonMumbai.s.sol`, `DeployCeloAlfajores.s.sol`, `DeployUnichainSepolia.s.sol`

## Purpose

Each script returns a RouterParameters struct with network-specific addresses for Uniswap factories, WETH, Permit2, and other protocol dependencies.

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
