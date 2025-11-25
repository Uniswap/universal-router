# Test Shared Utilities

## Overview

This directory contains shared TypeScript utilities and helpers used across integration tests. These modules provide common functionality for router deployment, transaction execution, encoding, and protocol interactions.

## Key Files

**Core Test Infrastructure:**
- `deployUniversalRouter.ts` - Deploy router instances for testing
- `executeRouter.ts` - Execute router commands with error handling
- `encodeCall.ts` - Encode router command calldata
- `planner.ts` - Command planner for building transaction sequences
- `v4Planner.ts` - V4-specific command planner

**Test Utilities:**
- `constants.ts` - Shared test constants and addresses
- `helpers.ts` - General testing helper functions
- `expect.ts` - Custom assertion utilities
- `parseEvents.ts` - Event parsing from transaction receipts

**Protocol Helpers:**
- `mainnetForkHelpers.ts` - Mainnet fork testing utilities
- `swapRouter02Helpers.ts` - Legacy SwapRouter02 comparison helpers
- `v4Helpers.ts` - Uniswap V4 testing utilities
- `getPermitNFTSignature.ts` - Generate Permit2 NFT signatures
- `getPermitV4Signature.ts` - Generate V4 permit signatures
- `protocolHelpers/permit2.ts` - Permit2 integration helpers

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
