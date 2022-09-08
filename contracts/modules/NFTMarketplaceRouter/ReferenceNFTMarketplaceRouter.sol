// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import {ERC721} from "solmate/tokens/ERC721.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {Owned} from "solmate/auth/Owned.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "solmate/utils/ReentrancyGuard.sol";

contract ReferenceNFTMarketplaceRouter is ReentrancyGuard, Owned(msg.sender) {
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

    /// @dev Loops through array of nft orders, first order always has to be seaport if its included.
    ///      Bundles LooksRare and X2Y2 together because they both require tokens to be transfered from
    ///      this contract to the user.
    function purchase(
        OrderType orderType,
        PurchaseParameters[] calldata purchaseParameters
    ) external payable nonReentrant {
        if (purchaseParameters.length == 0) revert NoOrders();

        bool fulfilledAnOrder;
        bool containsSeaport = orderType == OrderType.SEAPORT || orderType == OrderType.BOTH;

        if (containsSeaport) {
            (bool success, ) = SEAPORT_ADDRESS.call{value: purchaseParameters[0].amount}(purchaseParameters[0].wishDetails);
            fulfilledAnOrder = success;
        }

        for (uint256 i = containsSeaport ? 1 : 0; i < purchaseParameters.length;) {
            address marketplace = (purchaseParameters[i].marketplace == Marketplace.LooksRare ? LOOKSRARE_ADDRESS : X2Y2_ADDRESS);
            (bool success, ) = marketplace.call{value: purchaseParameters[i].amount}(purchaseParameters[i].wishDetails);

            if (success) {
                ERC721(purchaseParameters[i].collection)
                    .transferFrom(address(this), msg.sender, purchaseParameters[i].tokenId);
            }

            fulfilledAnOrder = fulfilledAnOrder || success;

            unchecked {
                ++i;
            }
        }

        if (!fulfilledAnOrder) revert NoFillableOrders();

        assembly {
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
