// SPDX-License-Identifier: UNLICENSED
pragma solidity >= 0.8.0;

enum MockedMarketplace {
    SEAPORT,
    X2Y2,
    LOOKSRARE
}

import {MockERC721} from "test/foundry-tests/mocks/MockERC721.sol";
import {MockERC1155} from "test/foundry-tests/mocks/MockERC1155.sol";

contract MockMarketplace {
    event Purchased(uint256 amount, MockedMarketplace marketplace, uint256 tokenId, address collectionAddress);
    event Here(uint256 amount);

    MockedMarketplace public marketplace;

    function l2r2Purchase(uint256 tokenId, address collectionAddress) public payable {
        require(marketplace != MockedMarketplace.SEAPORT, "Must be mocked LooksRare or X2Y2");

        MockERC721(collectionAddress).transferFrom(address(this), msg.sender, tokenId);
        emit Purchased(msg.value, marketplace, tokenId, collectionAddress);
    }

    function seaportPurchase(uint256 tokenId, address collectionAddress, address to) public payable {
        require(marketplace == MockedMarketplace.SEAPORT, "Not mocked seaport");

        MockERC721(collectionAddress).transferFrom(address(this), to, tokenId);
        emit Purchased(msg.value, marketplace, tokenId, collectionAddress);
    }

    function seaportERC1155Purchase(uint256 tokenId, address collectionAddress, address to) public payable {
        require(marketplace == MockedMarketplace.SEAPORT, "Not mocked seaport");

        MockERC1155(collectionAddress).safeTransferFrom(address(this), to, tokenId, 1, "");
        emit Purchased(msg.value, marketplace, tokenId, collectionAddress);
    }

    function failPurchase() public payable {
        revert("REFUND");
    }

    function setMarketplace(MockedMarketplace _marketplace) public {
        marketplace = _marketplace;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
