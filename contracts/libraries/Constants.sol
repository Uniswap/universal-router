// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.15;

/// @title Constant state
/// @notice Constant state used by the swap router
library Constants {
    /// @dev Used for identifying cases when this contract's balance of a token is to be used
    uint256 internal constant CONTRACT_BALANCE = 0;

    /// @dev Used as a flag for identifying msg.sender, saves gas by sending more 0 bytes
    address internal constant MSG_SENDER = address(1);

    /// @dev Used as a flag for identifying address(this), saves gas by sending more 0 bytes
    address internal constant ADDRESS_THIS = address(2);

    /// @dev Used as a flag for identifying the transfer of ETH instead a token
    address internal constant ETH = address(0);

    /// @dev The constants below here might vary between chains. They cannot be immutables as this is a library
    /// however deployers must be careful to update them to the correct address on each chain.

    /// @dev WETH9 address on mainnet
    address internal constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @dev The address of Seaport on mainnet
    address internal constant SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;
    /// @dev The address of NFTX zap contract on mainnet for interfacing with vaults
    address constant NFTX_ZAP = 0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d;
    /// @dev The address of LooksRare on mainnet
    address internal constant LOOKSRARE_EXCHANGE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;
}
