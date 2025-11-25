# Base Contracts

## Overview

This directory contains the foundational abstract contracts that form the core architecture of the Universal Router. These base contracts provide command dispatching, reentrancy protection, and signature verification.

## Key Files

- `Dispatcher.sol` - Abstract contract for decoding and executing router commands
- `Lock.sol` - Reentrancy lock mechanism for secure multi-step operations
- `RouteSigner.sol` - Signature verification for authorized routing operations

## Purpose

The base contracts establish the core execution model:
- **Dispatcher** orchestrates command execution across V2/V3/V4 swap modules
- **Lock** prevents reentrancy attacks during complex transaction flows
- **RouteSigner** enables gasless approvals via EIP-712 signatures

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
