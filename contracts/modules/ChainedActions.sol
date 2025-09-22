// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {Payments} from './Payments.sol';
import {IV3SpokePool} from '../interfaces/external/IV3SpokePool.sol';
import {AcrossV4DepositV3Params} from '../interfaces/IUniversalRouter.sol';
import {IERC20, SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

abstract contract ChainedActions is Payments {
    using SafeERC20 for IERC20;

    function _acrossV4DepositV3(bytes calldata input) internal {
        AcrossV4DepositV3Params memory params = abi.decode(input, (AcrossV4DepositV3Params));

        uint256 callValue = 0;

        if (params.useNative) {
            // Require ETH path to use WETH as inputToken per Across docs.
            // Router must currently hold ETH equal to inputAmount.
            callValue = params.inputAmount;
        } else {
            // Approve SpokePool to pull ERC20 from router
            IERC20(params.inputToken).forceApprove(params.spokePool, params.inputAmount);
        }

        IV3SpokePool(params.spokePool).depositV3{value: callValue}(
            params.depositor,
            params.recipient,
            params.inputToken,
            params.outputToken,
            params.inputAmount,
            params.outputAmount,
            params.destinationChainId,
            params.exclusiveRelayer,
            params.quoteTimestamp,
            params.fillDeadline,
            params.exclusivityDeadline,
            params.message
        );
    }
}
