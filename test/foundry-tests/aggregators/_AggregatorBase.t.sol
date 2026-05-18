// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from 'forge-std/Test.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {Hooks} from '@uniswap/v4-core/src/libraries/Hooks.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {Actions} from '@uniswap/v4-periphery/src/libraries/Actions.sol';
import {UniversalRouter} from '../../../contracts/UniversalRouter.sol';
import {Commands} from '../../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../../contracts/types/RouterParameters.sol';
import {UniswapV2AggregatorMock} from './v2/mocks/UniswapV2AggregatorMock.sol';

/// @title  AggregatorBase
/// @notice Shared base for aggregator-hook test suites. Brings up a mainnet fork,
///         deploys a fresh `UniversalRouter`, and deploys an in-tree mock of the
///         `UniswapV2Aggregator` hook (mirrors v4-hooks-public behavior, ^0.8.24
///         pragma so test code can override / extend it freely).
abstract contract AggregatorBase is Test {
    using PoolIdLibrary for PoolKey;

    // --------------------------------------------------------------------- //
    // Mainnet addresses
    // --------------------------------------------------------------------- //

    /// @dev Fork pin shared across the aggregator suites. PoolManager + APE pair
    ///      both deployed at this block with non-trivial reserves.
    uint256 internal constant FORK_BLOCK = 23_000_000;

    address internal constant V4_POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    IUniswapV2Factory internal constant V2_FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    IPermit2 internal constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    ERC20 internal constant WETH9 = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    ERC20 internal constant APE = ERC20(0x4d224452801ACEd8B2F0aebE155379bb5D594381); // V2-only at FORK_BLOCK
    ERC20 internal constant USDC = ERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48); // V2-Mostly
    ERC20 internal constant DAI = ERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F); // V2-Mostly

    // --------------------------------------------------------------------- //
    // V4 hook permission flags for UniswapV2Aggregator
    //   beforeInitialize        (bit 13, 0x2000)
    //   beforeAddLiquidity      (bit 11, 0x0800)
    //   beforeSwap              (bit 7,  0x0080)
    //   beforeSwapReturnsDelta  (bit 3,  0x0008)
    // --------------------------------------------------------------------- //
    uint160 internal constant V2_AGGREGATOR_HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
    );

    /// @dev SDK pins these for V2-aggregator PoolKeys. Neither participates in routing
    ///      (the hook reads V2 reserves directly).
    uint24 internal constant V2_AGG_FEE = 3000;
    int24 internal constant V2_AGG_TICK_SPACING = 60;
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    // --------------------------------------------------------------------- //
    // Test state
    // --------------------------------------------------------------------- //

    UniversalRouter internal router;
    IPoolManager internal poolManager;
    UniswapV2AggregatorMock internal aggregatorHook;
    bool internal forked;

    address internal alice = makeAddr('alice');

    // --------------------------------------------------------------------- //
    // Setup
    // --------------------------------------------------------------------- //

    function setUp() public virtual {
        try vm.envString('FORK_URL') returns (string memory) {
            vm.createSelectFork(vm.rpcUrl('mainnet'), FORK_BLOCK);
            forked = true;

            poolManager = IPoolManager(V4_POOL_MANAGER);
            require(address(poolManager).code.length > 0, 'V4 PoolManager not deployed at FORK_BLOCK');

            router = new UniversalRouter(_routerParameters());

            aggregatorHook = _deployAggregatorMock('1.0.0-test');
        } catch {
            console2.log(
                'Skipping aggregator fork test, no FORK_URL set. Add FORK_URL to .env and rerun to execute.'
            );
        }
    }

    modifier onlyForked() {
        if (forked) {
            _;
        } else {
            console2.log('skipped: forked-only test');
        }
    }

    // --------------------------------------------------------------------- //
    // Hook deployment — mock contract via CREATE2 with hook-flag salt
    // --------------------------------------------------------------------- //

    /// @notice Deploys the in-tree `UniswapV2AggregatorMock` at an address whose lower 14 bits
    ///         encode the V2 aggregator's permission-flag pattern.
    function _deployAggregatorMock(string memory hookVersion) internal returns (UniswapV2AggregatorMock hook) {
        bytes memory initCode = abi.encodePacked(
            type(UniswapV2AggregatorMock).creationCode,
            abi.encode(address(poolManager), address(V2_FACTORY), hookVersion)
        );
        (address predicted, bytes32 salt) = _mineHookSalt(address(this), V2_AGGREGATOR_HOOK_FLAGS, initCode);

        hook = new UniswapV2AggregatorMock{salt: salt}(poolManager, address(V2_FACTORY), hookVersion);
        require(address(hook) == predicted, 'AggregatorBase: hook create2 mismatch');
    }

    /// @dev Minimal HookMiner — brute-forces a CREATE2 salt whose deployed address has
    ///      `addr & 0x3FFF == flags`. Kept inline to avoid pulling extra test-only deps.
    function _mineHookSalt(address deployer, uint160 flags, bytes memory initCode)
        internal
        pure
        returns (address hookAddress, bytes32 salt)
    {
        bytes32 initCodeHash = keccak256(initCode);
        for (uint256 i; i < 200_000; ++i) {
            salt = bytes32(i);
            hookAddress = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash))))
            );
            if (uint160(hookAddress) & uint160(0x3FFF) == flags) return (hookAddress, salt);
        }
        revert('AggregatorBase: no salt found for flags');
    }

    // --------------------------------------------------------------------- //
    // PoolKey helpers
    // --------------------------------------------------------------------- //

    /// @notice Canonical V2-aggregator `PoolKey` for two tokens (sorted ascending).
    function _v2AggPoolKey(address tokenA, address tokenB) internal view returns (PoolKey memory key) {
        (address c0, address c1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: V2_AGG_FEE,
            tickSpacing: V2_AGG_TICK_SPACING,
            hooks: IHooks(address(aggregatorHook))
        });
    }

    /// @notice Initializes the V4 pool for a (tokenA, tokenB) pair (one-shot per pair).
    function _initializeV2AggPool(address tokenA, address tokenB) internal returns (PoolKey memory key, PoolId id) {
        key = _v2AggPoolKey(tokenA, tokenB);
        id = key.toId();
        poolManager.initialize(key, SQRT_PRICE_1_1);
    }

    // --------------------------------------------------------------------- //
    // Router setup
    // --------------------------------------------------------------------- //

    function _routerParameters() internal view returns (RouterParameters memory params) {
        params = RouterParameters({
            permit2: address(PERMIT2),
            weth9: address(WETH9),
            v2Factory: address(V2_FACTORY),
            v3Factory: address(0),
            pairInitCodeHash: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f,
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(poolManager),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
    }
}
