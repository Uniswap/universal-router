// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ILooksRareExchange } from '../interfaces/external/ILooksRareExchange.sol';
import { Payments } from '../base/Payments.sol';

contract LooksRareRouter {

    address public constant LOOKSRARE_EXCHANGE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;

    function _buyAssetForEth(
        ILooksRareExchange.TakerOrder calldata takerOrder,
        ILooksRareExchange.MakerOrder calldata makerOrder,
        address recipient
    ) internal {
        try ILooksRareExchange(LOOKSRARE_EXCHANGE).matchAskWithTakerBidUsingETHAndWETH{value: takerOrder.price}(
            takerOrder,
            makerOrder
        ) {
            if (IERC165(makerOrder.collection).supportsInterface(type(IERC1155).interfaceId)) {
                IERC721(makerOrder.collection).transferFrom(address(this), recipient, makerOrder.tokenId);
            } else if (IERC165(makerOrder.collection).supportsInterface(type(IERC1155).interfaceId)) {
                IERC1155(makerOrder.collection).safeTransferFrom(address(this), recipient, makerOrder.tokenId, makerOrder.amount, "0x");
            } else {
                revert("Unsupported interface");
            }
        } catch {}
    }
}