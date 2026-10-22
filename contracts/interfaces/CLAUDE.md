# Contract Interfaces

## Overview

This directory contains Solidity interfaces for the Universal Router and external protocol integrations. These interfaces define the public API and enable integration with other smart contracts.

## Key Files

- `IUniversalRouter.sol` - Main router interface with execute() methods and signature verification
- `ISwapProxy.sol` - Proxy enabling 2-tx swap flow (ERC20 approve + swap) without Permit2 signatures
- `IBalanceSwapProxy.sol` - Proxy for full-balance swaps: pre-signed route-bound Permit2 witness (relayed) or direct standing-approval modes
- `external/IV3SpokePool.sol` - Across Protocol V3 bridge integration interface

## Purpose

Interfaces provide:
- **Public API**: Standard method signatures for router execution
- **Type Safety**: Struct definitions (e.g., AcrossV4DepositV3Params) for cross-protocol operations
- **External Integration**: Typed interfaces for third-party protocols like Across bridge

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
