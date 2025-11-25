# Universal Router

## Overview

Smart contracts for Uniswap's Universal Router - a flexible, modular routing contract that enables complex multi-hop swaps across Uniswap V2, V3, and V4 protocols. Built with Solidity using Hardhat and Foundry.

## Scripts

- `npm run compile` - Compile contracts with Hardhat and Forge
- `npm run test:hardhat` - Run Hardhat integration tests
- `npm run test:gas` - Run gas benchmarking tests with snapshots
- `npm run test:all` - Run all tests (Hardhat + Foundry)
- `npm run lint` - Format TypeScript and Solidity files
- `npm run lint:check` - Check formatting without changes
- `npm run prettier:fix` - Format TypeScript and JSON files

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

**Production:**
- **@openzeppelin/contracts** (5.0.2) - Secure smart contract library
- **@uniswap/v2-core** (1.0.1) - Uniswap V2 protocol core
- **@uniswap/v3-core** (1.0.0) - Uniswap V3 protocol core

**Development:**
- **hardhat** (2.22.14) - Ethereum development environment
- **@nomicfoundation/hardhat-foundry** (1.1.2) - Foundry integration for Hardhat
- **@uniswap/router-sdk** (^1.3.0) - SDK for routing logic
- **@uniswap/sdk-core** (^3.0.1) - Core SDK utilities
- **@uniswap/v2-sdk** (^3.0.1) - V2 SDK for testing
- **@uniswap/v3-sdk** (^3.8.3) - V3 SDK for testing
- **ethers** (^5.7.2) - Ethereum library for JavaScript
- **typechain** (^4.0.0) - TypeScript bindings for contracts
- **typescript** (^3.7.3) - TypeScript compiler

## Structure

- `contracts/` - Solidity smart contracts
- `test/` - Test suites (Foundry + Hardhat)
- `script/` - Deployment scripts
- `deploy-addresses/` - Deployed contract addresses per network
- `audit/` - Security audit reports

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
