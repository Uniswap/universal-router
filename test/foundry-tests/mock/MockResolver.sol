// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IAmountResolver} from '../../../contracts/interfaces/IAmountResolver.sol';

/// @notice Returns a fixed amount, echoing the resolver-side contract a RESOLVE command staticcalls.
contract MockResolver is IAmountResolver {
    uint256 public amount;

    constructor(uint256 _amount) {
        amount = _amount;
    }

    function resolveAmount(bytes calldata) external view returns (uint256) {
        return amount;
    }
}

/// @notice A resolver that always reverts, to exercise the RESOLVE failure path.
contract RevertingResolver is IAmountResolver {
    error ResolverReverted();

    function resolveAmount(bytes calldata) external pure returns (uint256) {
        revert ResolverReverted();
    }
}

/// @notice A resolver that returns fewer than 32 bytes, which the router must treat as a failure.
contract ShortReturnResolver {
    fallback() external {
        assembly {
            return(0, 4)
        }
    }
}

/// @notice A resolver that returns a valid word followed by a large payload, to prove the router's
/// bounded 32-byte returndata copy neuters a return bomb.
contract BombResolver is IAmountResolver {
    uint256 public immutable value;

    constructor(uint256 _value) {
        value = _value;
    }

    function resolveAmount(bytes calldata) external view returns (uint256) {
        uint256 v = value;
        assembly {
            mstore(0, v)
            // Return a valid word followed by ~32KB of padding: far more than the router's
            // 32-byte copy window, but cheap enough that the resolver itself does not run out of gas.
            return(0, 0x8000)
        }
    }
}
