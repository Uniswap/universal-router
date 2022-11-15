// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import '../interfaces/external/IWETH9.sol';

/// @title Constant state
/// @notice Constant state used by the universal router
library Constants {
    /// @dev Used for identifying cases when this contract's balance of a token is to be used
    /// This is equivalent to 1<<255, a.k.a a singular 1 in the most significant bit.
    uint256 internal constant CONTRACT_BALANCE = 0x8000000000000000000000000000000000000000000000000000000000000000;

    /// @dev Used for identifying cases when a v2 pair has already received the input money
    uint256 internal constant ALREADY_PAID = 0;

    /// @dev Used as a flag for identifying the transfer of ETH instead a token
    address internal constant ETH = address(0);

    /// @dev Used as a flag for identifying msg.sender, saves gas by sending more 0 bytes
    address internal constant MSG_SENDER = address(1);

    /// @dev Used as a flag for identifying address(this), saves gas by sending more 0 bytes
    address internal constant ADDRESS_THIS = address(2);

    /// @dev The constants below here might vary between chains. They cannot be immutables as this is a library
    /// however deployers must be careful to update them to the correct address on each chain.

    /// @dev WETH9 address on mainnet
    IWETH9 internal constant WETH9 = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    /// @dev The address of Seaport on mainnet
    address internal constant SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;

    /// @dev The address of NFTX zap contract on mainnet for interfacing with vaults
    address constant NFTX_ZAP = 0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d;

    /// @dev The address of LooksRare on mainnet
    address internal constant LOOKS_RARE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;

    /// @dev The address of X2Y2 on mainnet
    address internal constant X2Y2 = 0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;

    // @dev The address of Foundation on mainnet
    address internal constant FOUNDATION = 0xcDA72070E455bb31C7690a170224Ce43623d0B6f;

    // @dev The address of Sudoswap's router on mainnet
    address internal constant SUDOSWAP = 0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329;

    // @dev the address of NFT20's zap contract on mainnet
    address internal constant NFT20_ZAP = 0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0;

    // @dev the address of Larva Lab's cryptopunks marketplace on mainnet
    address internal constant CRYPTOPUNKS = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
}
