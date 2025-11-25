# Router Modules

## Overview

This directory contains modular components that implement specific routing functionalities. Modules are composed together by the Dispatcher to provide comprehensive swap routing across Uniswap protocols.

## Structure

**Payment Modules:**
- `Payments.sol` - Core payment handling (ETH, ERC20 transfers)
- `PaymentsImmutables.sol` - Immutable payment configuration
- `Permit2Payments.sol` - Permit2-based token approvals

**Swap Modules:**
- `uniswap/v2/V2SwapRouter.sol` - Uniswap V2 swap execution
- `uniswap/v3/V3SwapRouter.sol` - Uniswap V3 swap execution
- `uniswap/v4/V4SwapRouter.sol` - Uniswap V4 swap execution
- `uniswap/UniswapImmutables.sol` - Uniswap protocol addresses

**Migration:**
- `V3ToV4Migrator.sol` - Liquidity migration from V3 to V4
- `MigratorImmutables.sol` - Migrator configuration

**Utilities:**
- `ChainedActions.sol` - Sequencing multiple operations
- `uniswap/v2/UniswapV2Library.sol` - V2 math and utilities
- `uniswap/v3/BytesLib.sol` - Byte manipulation for V3 paths
- `uniswap/v3/V3Path.sol` - V3 path encoding/decoding

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
