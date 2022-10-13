// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './BytesLib.sol';
import '../Router.sol';
import '../base/Commands.sol';

library CommandLib {
    using BytesLib for bytes;

    error InvalidCommandType(uint256 commandIndex);

    /// @notice mask for parsing command type, 5 least significant bits
    uint8 constant FLAG_COMMAND_TYPE_MASK = 0x1f;
    /// @notice offset of the command indices in a given command
    uint8 constant COMMAND_INDICES_OFFSET = 8;
    /// @notice The offset of the actual data in bytes
    uint8 constant PARAMS_LENGTH_OFFSET = 32;
    /// @notice the length of each command in bytes
    uint8 constant COMMAND_LENGTH_BYTES = 8;

    /// @notice Returns the number of commands in the list
    /// @param commands The encoded commands list
    /// @return The number of commands in the list
    function numCommands(bytes memory commands) internal pure returns (uint256) {
        return commands.length / COMMAND_LENGTH_BYTES;
    }

    /// @notice Fetch the data for the first command in the command bytes
    function decodeCommand(bytes memory commands, uint256 index)
        internal
        pure
        returns (uint8 flags, uint256 commandType, bytes8 indices)
    {
        bytes8 command;
        assembly {
            // loads the command at index
            command := mload(add(add(commands, PARAMS_LENGTH_OFFSET), mul(COMMAND_LENGTH_BYTES, index)))
        }

        flags = uint8(bytes1(command));
        commandType = flags & FLAG_COMMAND_TYPE_MASK;
        indices = bytes8(uint64(command) << COMMAND_INDICES_OFFSET);
    }
}
