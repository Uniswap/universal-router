// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.15;

/// @title Constant state
/// @notice Constant state used by the swap router
library Constants {
    /// @dev Used for identifying cases when this contract's balance of a token is to be used
    uint256 internal constant CONTRACT_BALANCE = 0;

    /// @dev Used as a flag for identifying the transfer of ETH instead a token
    address internal constant ETH = address(0);

    /// @dev Used as a flag for identifying msg.sender, saves gas by sending more 0 bytes
    address internal constant MSG_SENDER = address(1);

    /// @dev Used as a flag for identifying address(this), saves gas by sending more 0 bytes
    address internal constant ADDRESS_THIS = address(2);

    /// @dev The constants below here might vary between chains. They cannot be immutables as this is a library
    /// however deployers must be careful to update them to the correct address on each chain.

    /// @dev WETH9 address on mainnet
    address internal constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @dev The address of Seaport on mainnet
    address internal constant SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of NFTX zap contract on mainnet for interfacing with vaults
    address constant NFTX_ZAP = 0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d;

    /// @dev The address of LooksRare on mainnet
    address internal constant LOOKS_RARE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;

    /// @dev The address of LooksRare on mainnet
    address internal constant X2Y2 = 0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;

    // @dev The address of Foundation on mainnet
    address internal constant FOUNDATION = 0xcDA72070E455bb31C7690a170224Ce43623d0B6f;

    // @dev The address of Sudoswap's router on mainnet
    address internal constant SUDOSWAP = 0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329;
}
