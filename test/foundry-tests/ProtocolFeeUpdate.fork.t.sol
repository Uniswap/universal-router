// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from 'forge-std/Test.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IProtocolFees} from '@uniswap/v4-core/src/interfaces/IProtocolFees.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {StateLibrary} from '@uniswap/v4-core/src/libraries/StateLibrary.sol';
import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {MockERC20} from './mock/MockERC20.sol';

/// @dev The read side of the deployed fee adapters, which the router itself never needs.
interface IV4FeeAdapterView {
    function getFee(PoolKey memory key) external view returns (uint24);
}

interface IV3FeeAdapterView {
    function getFee(address pool) external view returns (uint8);
}

/// @notice Runs both protocol fee update commands against the fee adapters governance actually installed on
/// mainnet. The unit tests use mocks built from this PR's own interfaces, so only a fork proves the router's
/// calls match the deployed adapters and that a fresh pool ends up with the adapter's resolved fee.
contract ProtocolFeeUpdateForkTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // Both from script/deployParameters/DeployMainnet.s.sol
    IPoolManager constant POOL_MANAGER = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90);
    IUniswapV3Factory constant V3_FACTORY = IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);

    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;
    uint160 constant SQRT_PRICE_1_1 = uint160(1 << 96);

    UniversalRouter router;
    address token0;
    address token1;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 26_078_000);

        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(V3_FACTORY),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(POOL_MANAGER),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);

        // Fresh tokens give fresh pools, which start with no protocol fee
        address a = address(new MockERC20());
        address b = address(new MockERC20());
        (token0, token1) = a < b ? (a, b) : (b, a);
    }

    function _execute(uint256 command, bytes memory input) internal {
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = input;
        router.execute(abi.encodePacked(bytes1(uint8(command))), inputs);
    }

    function test_fork_v4ProtocolFeeUpdate_setsAdapterFeeOnFreshPool() public {
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
        POOL_MANAGER.initialize(key, SQRT_PRICE_1_1);
        (,, uint24 feeBefore,) = POOL_MANAGER.getSlot0(key.toId());
        assertEq(feeBefore, 0);

        address controller = IProtocolFees(address(POOL_MANAGER)).protocolFeeController();
        uint24 expected = IV4FeeAdapterView(controller).getFee(key);
        assertGt(expected, 0);

        _execute(Commands.V4_PROTOCOL_FEE_UPDATE, abi.encode(key));

        (,, uint24 feeAfter,) = POOL_MANAGER.getSlot0(key.toId());
        assertEq(feeAfter, expected);
    }

    function test_fork_v3ProtocolFeeUpdate_setsAdapterFeeOnFreshPool() public {
        IUniswapV3Pool pool = IUniswapV3Pool(V3_FACTORY.createPool(token0, token1, FEE));
        pool.initialize(SQRT_PRICE_1_1);
        (,,,,, uint8 feeBefore,) = pool.slot0();
        assertEq(feeBefore, 0);

        uint8 expected = IV3FeeAdapterView(V3_FACTORY.owner()).getFee(address(pool));
        assertGt(expected, 0);

        _execute(Commands.V3_PROTOCOL_FEE_UPDATE, abi.encode(address(pool)));

        (,,,,, uint8 feeAfter,) = pool.slot0();
        assertEq(feeAfter, expected);
    }
}
