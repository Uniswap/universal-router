# Type Definitions

## Overview

This directory contains Solidity type definitions and structs used throughout the Universal Router contracts.

## Key Files

- `RouterParameters.sol` - Configuration struct for router initialization

## Purpose

The RouterParameters struct defines all immutable configuration needed to initialize a Universal Router instance:
- **Payment addresses**: Permit2, WETH9
- **Uniswap protocols**: V2/V3/V4 factory addresses and init code hashes
- **V3→V4 migration**: Position manager addresses
- **Bridge integrations**: Across Protocol spoke pool

This centralized type definition ensures consistent configuration across all deployment networks.

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
