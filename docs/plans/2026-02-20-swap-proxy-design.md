# SwapProxy Design: Permit2-less Token Swaps

## Problem

First-time Permit2 swap flow requires 3 onchain transactions:

1. `token.approve(permit2, MAX)` - approve Permit2 contract
2. `permit2.approve(token, universalRouter, amount, expiration)` - on-chain Permit2 allowance
3. `universalRouter.execute(...)` - execute the swap

Some integrators cannot or prefer not to support EIP-712 signed permits (which would reduce this to 2 tx). They want a standard approve+swap (2 tx) flow without signed messages.

## Solution

A stateless **SwapProxy** contract that sits between the user and the Universal Router:

```
User -> approve SwapProxy (one-time)
User -> SwapProxy.execute() (each swap)
         |-> transferFrom(user -> UR, amount)
         |-> UR.execute(commands, inputs, deadline)
```

This leverages the existing `payerIsUser=false` path in the UR. When `payerIsUser` is false, all swap modules (V2, V3, V4) call `payOrPermit2Transfer()` which routes to `Payments.pay()` — a direct `ERC20.safeTransfer` from the router's balance, completely bypassing Permit2.

### Transaction Count

| Flow | First time | Subsequent |
|------|-----------|------------|
| Current Permit2 (no signing) | 3 tx | 1 tx |
| Current Permit2 (with signing) | 2 tx | 1 tx |
| **SwapProxy** | **2 tx** | **1 tx** |

## Contract Design

```solidity
// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from 'solmate/src/utils/SafeTransferLib.sol';
import {IUniversalRouter} from './interfaces/IUniversalRouter.sol';

/// @title SwapProxy
/// @notice Enables 2-tx swap flow (approve + swap) without Permit2 signed messages.
/// @dev Transfers tokens from the user directly into the Universal Router, then
///      executes UR commands with payerIsUser=false so the router uses its own balance.
contract SwapProxy {
    using SafeTransferLib for ERC20;

    IUniversalRouter public immutable universalRouter;

    constructor(IUniversalRouter _universalRouter) {
        universalRouter = _universalRouter;
    }

    /// @notice Pull ERC20 tokens from msg.sender into the Universal Router, then execute commands.
    /// @param token The ERC20 token to pull from the caller
    /// @param amount The amount of tokens to transfer into the UR
    /// @param commands The encoded UR commands to execute
    /// @param inputs The encoded inputs for each command
    /// @param deadline The transaction deadline
    /// @dev All swap commands MUST use payerIsUser=false.
    ///      All recipient addresses MUST be the user's explicit address, NOT MSG_SENDER (0xdead...0001),
    ///      because MSG_SENDER resolves to this proxy contract within the UR execution context.
    function execute(
        address token,
        uint256 amount,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable {
        // Pull tokens from user directly into the Universal Router
        ERC20(token).safeTransferFrom(msg.sender, address(universalRouter), amount);

        // Execute UR commands (forward any ETH for WRAP_ETH commands)
        universalRouter.execute{value: msg.value}(commands, inputs, deadline);

        // Refund any ETH that ended up at the proxy (e.g., from unwrapped WETH)
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            SafeTransferLib.safeTransferETH(msg.sender, ethBalance);
        }
    }

    // Accept ETH refunds
    receive() external payable {}
}
```

## Integration Guide

### Exact Input (e.g., 100 USDC -> ETH)

```
// One-time approval
USDC.approve(swapProxy, MAX_UINT256)

// Each swap
swapProxy.execute(
    USDC,                // token to pull
    100e6,               // exact amount
    [V3_SWAP_EXACT_IN],  // UR commands
    [abi.encode(
        userAddress,     // recipient: explicit address, NOT MSG_SENDER
        100e6,           // amountIn
        minAmountOut,    // slippage protection
        path,            // swap path
        false            // payerIsUser = false (critical!)
    )],
    deadline
)
```

### Exact Output (e.g., get 1 ETH, pay at most 3500 USDC)

```
swapProxy.execute(
    USDC,
    3500e6,                              // amountInMaximum (pre-funded to UR)
    [V3_SWAP_EXACT_OUT, SWEEP],          // swap + sweep excess back
    [
        abi.encode(
            userAddress,                 // recipient
            1e18,                        // amountOut
            3500e6,                      // amountInMax
            path,
            false                        // payerIsUser = false
        ),
        abi.encode(USDC, userAddress, 0) // sweep leftover USDC to user
    ],
    deadline
)
```

### Key Rules for Integrators

1. **`payerIsUser` must be `false`** in all swap commands — the UR uses its pre-funded balance
2. **Use explicit user addresses** for all recipients — `MSG_SENDER` (0xdead...0001) resolves to the proxy, not the user
3. **For exact output**: include a `SWEEP` command to return unused input tokens to the user
4. **ETH swaps**: users can still call UR directly (no Permit2 needed for native ETH)

## Security Properties

1. **Stateless** — no storage variables, no funds held between transactions
2. **Atomic** — if the UR execution reverts, the entire transaction reverts (transferFrom included)
3. **No admin** — immutable, no owner, no upgradability, no pause
4. **Minimal surface** — single function, ~15 lines of logic
5. **No Permit2 dependency** — standard ERC20 approve/transferFrom only

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Exact output with excess input | SWEEP command in UR sends excess back to user |
| MSG_SENDER used as recipient | Output tokens land at proxy. Integrator error — documented as forbidden. |
| ETH as output (UNWRAP_WETH) | UR sends ETH to user address directly (use explicit address) |
| Mixed ETH + ERC20 input | msg.value forwarded to UR for WRAP_ETH |
| Multi-hop | Intermediate tokens stay in UR; only final output goes to user |
| Swap reverts | Entire tx reverts atomically, no funds lost |

## Scope

- Supports all swap protocols: V2, V3, V4
- Supports both exact input and exact output
- Single ERC20 token input per call
- Does NOT support executeSigned (not needed — the whole point is avoiding signatures)

## Testing Plan

1. Exact input V2/V3/V4 swaps via proxy
2. Exact output V2/V3/V4 swaps with SWEEP
3. Multi-hop swaps
4. ETH forwarding (WRAP_ETH + swap)
5. Revert handling (insufficient output, deadline)
6. Gas comparison: proxy path vs direct Permit2 path
