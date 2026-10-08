// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {V2SwapRouter} from '../../contracts/modules/uniswap/v2/V2SwapRouter.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockFeeOnTransferERC20} from './mock/MockFeeOnTransferERC20.sol';

/// @notice OZ 2.3.0 N-04: a v2 exact-output route must revert when the recipient receives less than requested,
///         whichever hop holds the token that hands over less than the pair computed.
contract V2ExactOutputDeliveryTest is Test {
    IUniswapV2Factory constant FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    address constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant RECIPIENT = address(0xBEEF);
    uint256 constant AMOUNT_OUT = 1 ether;
    uint256 constant LIQUIDITY = 100 ether;

    UniversalRouter router;
    MockERC20 plain;
    MockFeeOnTransferERC20 taxed;
    MockFeeOnTransferERC20 withholding;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 20010000);

        router = new UniversalRouter(
            RouterParameters({
                permit2: PERMIT2,
                weth9: WETH9,
                v2Factory: address(FACTORY),
                v3Factory: address(0),
                pairInitCodeHash: bytes32(0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f),
                poolInitCodeHash: bytes32(0),
                v4PoolManager: address(0),
                permissionsAdapterFactory: address(0),
                v3NFTPositionManager: address(0),
                v4PositionManager: address(0),
                spokePool: address(0)
            })
        );

        plain = new MockERC20();
        taxed = new MockFeeOnTransferERC20(100); // 1% fee
        withholding = new MockFeeOnTransferERC20(10_000); // keeps everything

        _seedPair(WETH9, address(plain));
        _seedPair(WETH9, address(taxed));
        _seedPair(address(taxed), address(plain));
        _seedPair(WETH9, address(withholding));

        // the router pays the first pair from its own balance (payerIsUser = false), so no Permit2 setup is needed
        deal(WETH9, address(router), 1_000 ether);
    }

    function _seedPair(address a, address b) internal {
        address pair = FACTORY.getPair(a, b);
        if (pair == address(0)) pair = FACTORY.createPair(a, b);
        deal(a, pair, LIQUIDITY);
        deal(b, pair, LIQUIDITY);
        IUniswapV2Pair(pair).sync();
    }

    function _exactOut(address[] memory path) internal pure returns (bytes memory commands, bytes[] memory inputs) {
        commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
        inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, AMOUNT_OUT, type(uint256).max, path, false, new uint256[](0));
    }

    function _path2(address a, address b) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = a;
        path[1] = b;
    }

    function test_v2ExactOutput_standardToken_deliversExactly() public {
        (bytes memory commands, bytes[] memory inputs) = _exactOut(_path2(WETH9, address(plain)));

        router.execute(commands, inputs);

        assertEq(plain.balanceOf(RECIPIENT), AMOUNT_OUT);
    }

    function test_v2ExactOutput_feeOnTransferOutput_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _exactOut(_path2(WETH9, address(taxed)));

        vm.expectRevert(V2SwapRouter.V2TooLittleReceived.selector);
        router.execute(commands, inputs);
    }

    /// @dev The taxed token sits in the middle: the second pair receives less than the first pair sent, so the
    ///      final hop delivers less than requested even though the output token itself is standard.
    function test_v2ExactOutput_feeOnTransferIntermediate_reverts() public {
        address[] memory path = new address[](3);
        path[0] = WETH9;
        path[1] = address(taxed);
        path[2] = address(plain);
        (bytes memory commands, bytes[] memory inputs) = _exactOut(path);

        vm.expectRevert(V2SwapRouter.V2TooLittleReceived.selector);
        router.execute(commands, inputs);
    }

    function test_v2ExactOutput_withholdingOutput_reverts() public {
        (bytes memory commands, bytes[] memory inputs) = _exactOut(_path2(WETH9, address(withholding)));

        vm.expectRevert(V2SwapRouter.V2TooLittleReceived.selector);
        router.execute(commands, inputs);
    }
}
