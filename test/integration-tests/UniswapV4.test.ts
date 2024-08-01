import type { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { expect } from './shared/expect'
import { IPermit2, PoolManager, PositionManager, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, PERMIT2 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MAX_UINT, MAX_UINT160 } from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter from './shared/deployUniversalRouter'
import { CommandType, RoutePlanner } from './shared/planner'
import hre from 'hardhat'
import {
  addLiquidityToV4Pool,
  DAI_USDC,
  deployV4PoolManager,
  encodeMultihopExactInPath,
  encodeMultihopExactOutPath,
  encodeMultihopPath,
  ETH_USDC,
  initializeV4Pool,
  USDC_WETH,
} from './shared/v4Helpers'
import { Actions, V4Planner } from './shared/v4Planner'
import { executeRouter } from './shared/executeRouter'
const { ethers } = hre

describe('Uniswap V4 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: IPermit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner
  let v4Planner: V4Planner
  let v4PoolManager: PoolManager
  let v4PositionManager: PositionManager

  // exact in trade
  const amountInUSDC: BigNumber = expandTo6DecimalsBN(1000)
  const minAmountOutWETH: BigNumber = expandTo18DecimalsBN(0.25)

  // exact out trade
  const amountOutWETH = expandTo18DecimalsBN(0.26)
  const maxAmountInUSDC = expandTo6DecimalsBN(1000)

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, bob)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, bob)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, bob)
    permit2 = PERMIT2.connect(bob) as IPermit2
    v4PoolManager = (await deployV4PoolManager()).connect(bob) as PoolManager
    router = (await deployUniversalRouter(v4PoolManager.address)).connect(bob) as UniversalRouter
    v4PositionManager = (await ethers.getContractAt('PositionManager', await router.V4_POSITION_MANAGER())).connect(
      bob
    ) as PositionManager

    planner = new RoutePlanner()
    v4Planner = new V4Planner()

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(1000000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(1000))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(50000000))

    // Bob max-approves the permit2 contract to access his DAI and WETH
    await daiContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)

    // for these tests Bob gives the router max approval on permit2
    await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
    await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    await permit2.approve(USDC.address, router.address, MAX_UINT160, DEADLINE)

    // for setting up pools, bob gives position manager approval on permit2
    await permit2.approve(DAI.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
    await permit2.approve(WETH.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
    await permit2.approve(USDC.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
    // bob initializes 3 v4 pools
    await initializeV4Pool(v4PoolManager, USDC_WETH.poolKey, USDC_WETH.price)
    await initializeV4Pool(v4PoolManager, DAI_USDC.poolKey, DAI_USDC.price)
    await initializeV4Pool(v4PoolManager, ETH_USDC.poolKey, ETH_USDC.price)

    // bob adds liquidity to the pools
    await addLiquidityToV4Pool(v4PositionManager, USDC_WETH, expandTo18DecimalsBN(2).toString(), bob)
    await addLiquidityToV4Pool(v4PositionManager, DAI_USDC, expandTo18DecimalsBN(400).toString(), bob)
    await addLiquidityToV4Pool(v4PositionManager, ETH_USDC, expandTo18DecimalsBN(0.1).toString(), bob)
  })

  describe('ERC20 --> ERC20', () => {
    it('completes a v4 exactInSingle swap', async () => {
      v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountIn: amountInUSDC,
          amountOutMinimum: minAmountOutWETH,
          sqrtPriceLimitX96: 0,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [USDC_WETH.poolKey.currency0])
      v4Planner.addAction(Actions.TAKE_ALL, [USDC_WETH.poolKey.currency1, bob.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.eq(amountInUSDC)
    })

    it('completes a v4 exactIn 1 hop swap', async () => {
      let currencyIn = USDC_WETH.poolKey.currency0
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([USDC_WETH.poolKey], currencyIn),
          amountIn: amountInUSDC,
          amountOutMinimum: minAmountOutWETH,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [USDC_WETH.poolKey.currency0])
      v4Planner.addAction(Actions.TAKE_ALL, [USDC_WETH.poolKey.currency1, bob.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.eq(amountInUSDC)
    })

    it('completes a v4 exactOutSingle swap', async () => {
      v4Planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountOut: amountOutWETH,
          amountInMaximum: maxAmountInUSDC,
          sqrtPriceLimitX96: 0,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [USDC_WETH.poolKey.currency0])
      v4Planner.addAction(Actions.TAKE_ALL, [USDC_WETH.poolKey.currency1, bob.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutWETH)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
    })

    it('completes a v4 exactOut 1 hop swap', async () => {
      let currencyOut = USDC_WETH.poolKey.currency1
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([USDC_WETH.poolKey], currencyOut),
          amountOut: amountOutWETH,
          amountInMaximum: maxAmountInUSDC,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [USDC_WETH.poolKey.currency0])
      v4Planner.addAction(Actions.TAKE_ALL, [USDC_WETH.poolKey.currency1, bob.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutWETH)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
    })
  })
})
