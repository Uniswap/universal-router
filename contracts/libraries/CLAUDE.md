# Contract Libraries

## Overview

This directory contains reusable Solidity libraries that provide shared functionality across the Universal Router contracts. These libraries handle command definitions, constants, locking mechanisms, and input amount calculations.

## Key Files

- `Commands.sol` - Command type definitions and constants for router operations
- `Constants.sol` - Protocol-wide constants (addresses, magic values, flags)
- `Locker.sol` - Reentrancy lock state management library
- `MaxInputAmount.sol` - Utility for calculating maximum input amounts in swaps

## Purpose

Libraries provide:
- **Command System**: Standardized command byte codes for routing operations
- **Shared Constants**: Protocol addresses and configuration values
- **State Management**: Thread-safe locking for complex transaction flows
- **Math Utilities**: Safe calculations for swap input amounts

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
