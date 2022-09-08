// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "forge-std/Test.sol";
import {ReferenceNFTMarketplaceRouter} from "contracts/modules/NFTMarketplaceRouter/ReferenceNFTMarketplaceRouter.sol";
import {MockMarketplace, MockedMarketplace} from "test/foundry-tests/mocks/MockMarketplace.sol";
import {MockERC721} from "test/foundry-tests/mocks/MockERC721.sol";

contract ReferenceNFTMarketplaceRouterTest is Test {
    event Purchased(uint256 amount, MockedMarketplace marketplace, uint256 tokenId, address collectionAddress);

    ReferenceNFTMarketplaceRouter refRouter;
    MockMarketplace seaport;
    MockMarketplace x2y2;
    MockMarketplace looksRare;

    MockERC721 token;

    uint256 internal alicePk = 0xa11ce;
    address payable internal alice = payable(vm.addr(alicePk));

    address private constant SEAPORT_ADDRESS =
        0x00000000006c3852cbEf3e08E8dF289169EdE581;
    address private constant X2Y2_ADDRESS =
        0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;
    address private constant LOOKSRARE_ADDRESS =
        0x59728544B08AB483533076417FbBB2fD0B17CE3a;

    function setUp() public {
        deployContracts();
        deal();
    }

    function deployContracts() internal {
        refRouter = new ReferenceNFTMarketplaceRouter();

        seaport = new MockMarketplace();
        x2y2 = new MockMarketplace();
        looksRare = new MockMarketplace();

        token = new MockERC721("Token", "TKN");

        vm.etch(SEAPORT_ADDRESS, address(seaport).code);
        vm.etch(X2Y2_ADDRESS, address(x2y2).code);
        vm.etch(LOOKSRARE_ADDRESS, address(looksRare).code);

       MockMarketplace(SEAPORT_ADDRESS).setMarketplace(MockedMarketplace.SEAPORT); 
       MockMarketplace(X2Y2_ADDRESS).setMarketplace(MockedMarketplace.X2Y2); 
       MockMarketplace(LOOKSRARE_ADDRESS).setMarketplace(MockedMarketplace.LOOKSRARE); 
    }

    function deal() internal {
        vm.deal(alice, 100 ether);
        vm.label(alice, "ALICE");

        token.bulkMint(SEAPORT_ADDRESS, 0, 50);
        token.bulkMint(X2Y2_ADDRESS, 50, 25);
        token.bulkMint(LOOKSRARE_ADDRESS, 75, 25);
    }

    /*//////////////////////////////////////////////////////////////
                              SOLIDITY-BASED TESTS
    //////////////////////////////////////////////////////////////*/

    function testRefSingleBuys() public {
        bytes memory seaportCalldata = abi.encodeWithSelector(seaport.seaportPurchase.selector, 0, address(token), alice);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory seaportParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            0,
            address(token),
            seaportCalldata
        );
        
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](1);
        parameters[0] = seaportParameters;
        
        vm.expectEmit(false, false, false, true);
        emit Purchased(5 ether, MockedMarketplace.SEAPORT, 0, address(token));
        vm.prank(alice);
        refRouter.purchase{value: 5 ether}(ReferenceNFTMarketplaceRouter.OrderType.SEAPORT, parameters);

        bytes memory x2y2Calldata = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 50, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata
        );
        
        parameters[0] = x2y2Parameters;
        
        vm.expectEmit(false, false, false, true);
        emit Purchased(5 ether, MockedMarketplace.X2Y2, 50, address(token));
        vm.prank(alice);
        refRouter.purchase{value: 5 ether}(ReferenceNFTMarketplaceRouter.OrderType.L2R2, parameters);

        bytes memory looksRareCalldata = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 75, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata
        );
        
        parameters[0] = looksRareParameters;
        
        vm.expectEmit(false, false, false, true);
        emit Purchased(5 ether, MockedMarketplace.LOOKSRARE, 75, address(token));
        vm.prank(alice);
        refRouter.purchase{value: 5 ether}(ReferenceNFTMarketplaceRouter.OrderType.L2R2, parameters);
        
        assertEq(token.ownerOf(0), alice);
        assertEq(token.ownerOf(50), alice);
        assertEq(token.ownerOf(75), alice);
        assertEq(alice.balance, 85 ether);
    }

    function testRefBuysAcrossAllMarketplaces() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](3);
    
        bytes memory seaportCalldata = abi.encodeWithSelector(seaport.seaportPurchase.selector, 0, address(token), alice);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory seaportParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            0,
            address(token),
            seaportCalldata
        );
        
        parameters[0] = seaportParameters;
        
        bytes memory x2y2Calldata = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 50, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata
        );
        
        parameters[1] = x2y2Parameters;
    
        bytes memory looksRareCalldata = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 75, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata
        );
        
        parameters[2] = looksRareParameters;
        
        vm.prank(alice);
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.BOTH, parameters);
        
        assertEq(token.ownerOf(0), alice);
        assertEq(token.ownerOf(50), alice);
        assertEq(token.ownerOf(75), alice);
        assertEq(alice.balance, 85 ether);
    }
    
    function testRefOnlyL2R2Buys() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](2);
    
        bytes memory x2y2Calldata = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 50, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata
        );
        
        parameters[0] = x2y2Parameters;
    
        bytes memory looksRareCalldata = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 75, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata
        );
        
        parameters[1] = looksRareParameters;
        
        vm.prank(alice);
        refRouter.purchase{value: 10 ether}(ReferenceNFTMarketplaceRouter.OrderType.L2R2, parameters);
        
        assertEq(token.ownerOf(50), alice);
        assertEq(token.ownerOf(75), alice);
        assertEq(alice.balance, 90 ether);
    }
    
    function testRefOnlyX2Y2Buys() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](3);
    
        bytes memory x2y2Calldata1 = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 50, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters1 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata1
        );
        
        parameters[0] = x2y2Parameters1;
    
        bytes memory x2y2Calldata2 = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 51, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters2 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            51,
            address(token),
            x2y2Calldata2
        );
        
        parameters[1] = x2y2Parameters2;
    
        bytes memory x2y2Calldata3 = abi.encodeWithSelector(x2y2.l2r2Purchase.selector, 52, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters3 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            52,
            address(token),
            x2y2Calldata3
        );
        
        parameters[2] = x2y2Parameters3;
        
        vm.prank(alice);
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.L2R2, parameters);
        
        assertEq(token.ownerOf(50), alice);
        assertEq(token.ownerOf(51), alice);
        assertEq(token.ownerOf(52), alice);
        assertEq(alice.balance, 85 ether);
    }
    
    function testRefOnlyLooksRareBuys() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](3);
    
        bytes memory looksRareCalldata1 = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 75, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters1 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata1
        );
        
        parameters[0] = looksRareParameters1;
    
        bytes memory looksRareCalldata2 = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 76, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters2 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            76,
            address(token),
            looksRareCalldata2
        );
        
        parameters[1] = looksRareParameters2;
    
        bytes memory looksRareCalldata3 = abi.encodeWithSelector(looksRare.l2r2Purchase.selector, 77, address(token));
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters3 = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            77,
            address(token),
            looksRareCalldata3
        );
        
        parameters[2] = looksRareParameters3;
        
        vm.prank(alice);
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.L2R2, parameters);
        
        assertEq(token.ownerOf(75), alice);
        assertEq(token.ownerOf(76), alice);
        assertEq(token.ownerOf(77), alice);
        assertEq(alice.balance, 85 ether);
    }
    
    function testRefOneBuyTwoRefund() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](3);
    
        bytes memory seaportCalldata = abi.encodeWithSelector(seaport.seaportPurchase.selector, 0, address(token), alice);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory seaportParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            0,
            address(token),
            seaportCalldata
        );
        
        parameters[0] = seaportParameters;
        
        bytes memory x2y2Calldata = abi.encodeWithSelector(x2y2.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata
        );
        
        parameters[1] = x2y2Parameters;
    
        bytes memory looksRareCalldata = abi.encodeWithSelector(looksRare.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata
        );
        
        parameters[2] = looksRareParameters;
        
        vm.prank(alice);
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.BOTH, parameters);
        
        assertEq(token.ownerOf(0), alice);
        assertEq(alice.balance, 95 ether);
    }
    
    function testRefThreeFailShouldRevert() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](3);
    
        bytes memory seaportCalldata = abi.encodeWithSelector(seaport.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory seaportParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            0,
            address(token),
            seaportCalldata
        );
        
        parameters[0] = seaportParameters;
        
        bytes memory x2y2Calldata = abi.encodeWithSelector(x2y2.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory x2y2Parameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.X2Y2,
            50,
            address(token),
            x2y2Calldata
        );
        
        parameters[1] = x2y2Parameters;
    
        bytes memory looksRareCalldata = abi.encodeWithSelector(looksRare.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory looksRareParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            75,
            address(token),
            looksRareCalldata
        );
        
        parameters[2] = looksRareParameters;
        
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReferenceNFTMarketplaceRouter.NoFillableOrders.selector));
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.BOTH, parameters);
        
        assertEq(alice.balance, 100 ether);
    }
    
    function testRefEmptyOrder() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](1);
    
        bytes memory seaportCalldata = abi.encodeWithSelector(seaport.failPurchase.selector);
        ReferenceNFTMarketplaceRouter.PurchaseParameters memory seaportParameters = ReferenceNFTMarketplaceRouter.PurchaseParameters(
            5 ether,
            ReferenceNFTMarketplaceRouter.Marketplace.LooksRare,
            0,
            address(token),
            seaportCalldata
        );
        
        parameters[0] = seaportParameters;
        
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReferenceNFTMarketplaceRouter.NoFillableOrders.selector));
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.EMPTY, parameters);
        
        assertEq(alice.balance, 100 ether);
    }
    
    function testRefEmptyOrderArray() public {
        ReferenceNFTMarketplaceRouter.PurchaseParameters[] memory parameters = new ReferenceNFTMarketplaceRouter.PurchaseParameters[](0);
        
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReferenceNFTMarketplaceRouter.NoOrders.selector));
        refRouter.purchase{value: 15 ether}(ReferenceNFTMarketplaceRouter.OrderType.EMPTY, parameters);
        
        assertEq(alice.balance, 100 ether);
    }
}

