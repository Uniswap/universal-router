# Test Contracts

## Overview

This directory contains Solidity contracts used exclusively for testing the Universal Router. These include mock tokens, test utilities, and example modules for integration testing.

## Key Files

- `MintableERC20.sol` - Mock ERC20 token for test scenarios
- `ReenteringWETH.sol` - WETH mock with reentrancy capabilities for security testing
- `TestCustomErrors.sol` - Utilities for testing custom error handling
- `ExampleModule.sol` - Example module implementation for extension testing
- `ImportsForTypechain.sol` - Import aggregator for TypeChain type generation

## Purpose

Test contracts enable:
- **Token Mocking**: Mintable ERC20s for controlled test environments
- **Security Testing**: Reentrancy attack simulations
- **Type Generation**: Complete TypeScript bindings via TypeChain
- **Extension Testing**: Example modules demonstrating router extensibility

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
