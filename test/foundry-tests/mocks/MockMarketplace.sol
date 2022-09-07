// SPDX-License-Identifier: UNLICENSED
pragma solidity >= 0.8.0;

enum MockedMarketplace {
    SEAPORT,
    X2Y2,
    LOOKSRARE
}

import {MockERC721} from "test/foundry-tests/mocks/MockERC721.sol";

contract MockMarketplace {
    event Purchased(uint256 amount, MockedMarketplace marketplace, uint256 tokenId, address collectionAddress);

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

    function failPurchase() public payable {
        revert("REFUND");
    }

    function setMarketplace(MockedMarketplace _marketplace) public {
        marketplace = _marketplace;
    }
}
