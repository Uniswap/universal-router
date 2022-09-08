// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import {ERC721} from "solmate/tokens/ERC721.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {Owned} from "solmate/auth/Owned.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "solmate/utils/ReentrancyGuard.sol";

contract NFTMarketplaceRouter is ReentrancyGuard, Owned(msg.sender) {
    struct PurchaseParameters {
        uint256 amount;
        Marketplace marketplace;
        uint256 tokenId;
        address collection;
        bytes wishDetails;
    }

    /// @dev pathing is determined in binary
    /// @dev if 1 in first position then order contains a seaport order
    /// @dev if 1 in second position then order contains x2y2/looksrare orders
    enum OrderType {
        // 0[00]: Empty order
        EMPTY,
        // 1[01]: Seaport only
        SEAPORT,
        // 2[10]: LooksRare/X2Y2 only
        L2R2,
        // 3[11]: Seaport + LooksRare/X2Y2
        BOTH
    }

    enum Marketplace {
        /// @dev Seaport is not in enum because its logic branch doesn't check for marketplace
        LooksRare,
        X2Y2
    }

    error NoFillableOrders();
    error UnableToRefund();
    error NoOrders();

    address private constant SEAPORT_ADDRESS =
        0x00000000006c3852cbEf3e08E8dF289169EdE581;
    address private constant LOOKSRARE_ADDRESS =
        0x59728544B08AB483533076417FbBB2fD0B17CE3a;
    address private constant X2Y2_ADDRESS =
        0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;

    // 0x44 (array length) = 0x04 (selector) + 0x20 (orderType) + 0x20 (location of array)
    uint256 constant ARRAY_LENGTH_POINTER = 0x44;
    // 0x64 (location of array) = 0x04 (selector) + 0x20 (orderType) + 0x20 (location of array) + 0x20(length of array)
    uint256 constant ARRAY_OFFSET_POINTER = 0x64;

    uint256 constant DEFAULT_FREE_MEMORY_POINTER = 0x80;
    uint256 constant ONE_WORD = 0x20;
    uint256 constant TWO_WORDS = 0x40;
    uint256 constant THREE_WORDS = 0x60;
    uint256 constant FOUR_WORDS = 0x80;

    /// @dev Loops through array of nft orders, first order always has to be seaport if its included.
    ///      Bundles LooksRare and X2Y2 together because they both require tokens to be transfered from
    ///      this contract to the user.
    function purchase(
        OrderType orderType,
        PurchaseParameters[] calldata purchaseParameters
    ) external payable nonReentrant {
        uint256 numberOfOrders;
        uint256 containsSeaport;
        uint256 fulfilledAnOrder;
        bool containsL2R2;

        assembly {
            // checks if bit is first position of orderType is 1
            containsSeaport := and(orderType, 1)
            // checks if bit in second position is 1
            containsL2R2 := gt(orderType, 1)

            // length of array is the number of orders
            numberOfOrders := calldataload(ARRAY_LENGTH_POINTER)

            // if an order is empty revert
            if iszero(numberOfOrders) {
                mstore(0, "NoOrders()")
                let sig := keccak256(0, 0x0a)
                mstore(0, sig)
                revert(0, 0x04)
            }

            /// @dev we branch for seaport separately because it will only be called once
            ///      so any checks in a for loop would waste gas
            if containsSeaport {
                // pointer to location of purchaseParameters struct in calldata
                let structOffset := calldataload(ARRAY_OFFSET_POINTER)
                let structPointer := add(structOffset, ARRAY_OFFSET_POINTER)
                // amount is first word in stuct calldata
                let amount := calldataload(structPointer)

                // offset to the encoded calldata bytes for seaport is the fifth word in struct calldata
                let structBytesOffset := calldataload(add(structPointer, FOUR_WORDS))

                // pointer to the encoded calldata bytes
                let structBytesPointer := add(structPointer, structBytesOffset)
                // length of the encoded calldata is the first word
                let lengthOfData := calldataload(structBytesPointer)
                // copy the encoded calldata to memory
                calldatacopy(
                    DEFAULT_FREE_MEMORY_POINTER,
                    add(structBytesPointer, ONE_WORD),
                    lengthOfData
                )
                let success := call(
                    gas(),
                    SEAPORT_ADDRESS,
                    amount,
                    DEFAULT_FREE_MEMORY_POINTER,
                    lengthOfData,
                    0,
                    ONE_WORD
                )

                // set to true if order was filled
                fulfilledAnOrder := success
            }
        }

        if (containsL2R2) {
            uint256 tokenId;
            bytes32 collectionAddress;

            unchecked {
                for (uint256 i = containsSeaport; i < numberOfOrders; ++i) {
                    bool success;
                    assembly {
                        // calculating the offset for this order's struct in calldata
                        let structOffset := calldataload(
                            add(ARRAY_OFFSET_POINTER, mul(i, ONE_WORD))
                        )
                        // pointer to location of this order's purchaseParameters struct in calldata
                        let structPointer := add(structOffset, ARRAY_OFFSET_POINTER)
                        // fetching calldata parameters at appropriate offsets
                        let amount := calldataload(structPointer)
                        let marketplaceType := calldataload(
                            add(structPointer, ONE_WORD)
                        )
                        tokenId := calldataload(add(structPointer, TWO_WORDS))
                        collectionAddress := calldataload(
                            add(structPointer, THREE_WORDS)
                        )
                        let structBytesOffset := calldataload(
                            add(structPointer, FOUR_WORDS)
                        )

                        // pointer to encoded calldata
                        let structBytesPointer := add(
                            structPointer,
                            structBytesOffset
                        )
                        // length of bytes is first word
                        let lengthOfData := calldataload(structBytesPointer)
                        // set default address to x2y2
                        let marketplaceAddress := X2Y2_ADDRESS
                        // check if marketplaceType is looksrare
                        if iszero(marketplaceType) {
                            marketplaceAddress := LOOKSRARE_ADDRESS
                        }
                        // copy the encoded calldata to memory
                        calldatacopy(
                            DEFAULT_FREE_MEMORY_POINTER,
                            add(structBytesPointer, ONE_WORD),
                            lengthOfData
                        )
                        success := call(
                            gas(),
                            marketplaceAddress,
                            amount,
                            DEFAULT_FREE_MEMORY_POINTER,
                            lengthOfData,
                            0,
                            ONE_WORD
                        )

                        // set to true if order was filled
                        fulfilledAnOrder := or(fulfilledAnOrder, success)
                    }

                    // transfer erc721 to user if order was filled (looksrare and x2y2 transfer it to the contract)
                    if (success) {
                        ERC721(address(uint160(uint256(collectionAddress))))
                            .transferFrom(address(this), msg.sender, tokenId);
                    }
                }
            }
        }

        assembly {
            // if not a single order was filled revert
            if iszero(fulfilledAnOrder) {
                mstore(0, "NoFillableOrders()")
                let sig := keccak256(0, 0x12)
                mstore(0, sig)
                revert(0, 0x04)
            }

            // refund user if available
            if gt(selfbalance(), 0) {
                let returnCallStatus := call(
                    gas(),
                    caller(),
                    selfbalance(),
                    0,
                    0,
                    0,
                    0
                )

                if iszero(returnCallStatus) {
                    mstore(0, "UnableToRefund()")
                    let sig := keccak256(0, 0x10)
                    mstore(0, sig)
                    revert(0, 0x04)
                }
            }
        }
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}

    function claimLooksRareRewards(bytes calldata claimData, address distributor) external nonReentrant onlyOwner {
        address looksRareClaimRewards = 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72;
        ERC20 looksRareToken = ERC20(0xf4d2888d29D722226FafA5d9B24F9164c092421E);

        (bool success, ) = looksRareClaimRewards.call(claimData);
        require(success, "Unable to claim");
        
        SafeTransferLib.safeTransfer(looksRareToken, distributor, looksRareToken.balanceOf(address(this)));
    }
}
