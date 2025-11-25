# Deployment Utilities

## Overview

This directory contains utility contracts used during the deployment process to handle protocol-specific deployment scenarios.

## Key Files

- `UnsupportedProtocol.sol` - Placeholder contract for unsupported protocol implementations on specific networks

## Purpose

Provides deployment-time utilities for managing protocol availability across different blockchain networks. When a protocol (e.g., specific Uniswap version) is not available on a deployment target, this contract serves as a safe fallback implementation.

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md` to keep this documentation synchronized with the codebase.
