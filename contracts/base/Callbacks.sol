// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {IERC165} from '@openzeppelin/contracts-v4/utils/introspection/IERC165.sol';

/// @title ERC Callback Support
/// @notice Implements various functions introduced by a variety of ERCs for security reasons.
/// All are called by external contracts to ensure that this contract safely supports the ERC in question.
contract Callbacks {
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}
