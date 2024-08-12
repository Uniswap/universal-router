import type { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { expect } from './shared/expect'
import { IPermit2, PoolManager, PositionManager, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, PERMIT2 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ETH_ADDRESS, MAX_UINT, MAX_UINT160, ONE_PERCENT_BIPS } from './shared/constants'
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
  const amountIn = 1000
  const amountInUSDC: BigNumber = expandTo6DecimalsBN(amountIn)
  const amountInDAI: BigNumber = expandTo18DecimalsBN(amountIn)
  const minAmountOutWETH: BigNumber = expandTo18DecimalsBN(0.25)

  // exact out trade
  const amountOutWETH = expandTo18DecimalsBN(0.26)
  const maxAmountIn = 1000
  const maxAmountInUSDC = expandTo6DecimalsBN(maxAmountIn)
  const maxAmountInDAI = expandTo18DecimalsBN(maxAmountIn)

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
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [usdcContract.address, wethContract.address])
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
      // USDC -> WETH
      let currencyIn = usdcContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([USDC_WETH.poolKey], currencyIn),
          amountIn: amountInUSDC,
          amountOutMinimum: minAmountOutWETH,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, wethContract.address])

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

    it('completes a v4 exactIn 2 hop swap', async () => {
      // DAI -> USDC -> WETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutWETH,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, wethContract.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountInDAI)
    })

    it('completes a v4 exactIn 2 hop swap, with take portion', async () => {
      // DAI -> USDC -> WETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutWETH,
        },
      ])
      // take 1% of the output to alice, then settle and take the rest to the caller
      v4Planner.addAction(Actions.TAKE_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, wethContract.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)

      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)

      const aliceFee = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)
      const bobEarnings = wethBalanceAfter.sub(wethBalanceBefore)
      const totalOut = aliceFee.add(bobEarnings)

      expect(totalOut).to.be.gte(minAmountOutWETH)
      expect(totalOut.mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
    })

    it('completes a v4 exactIn 2 hop swap, with take portion native', async () => {
      // DAI -> USDC -> ETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, ETH_USDC.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutWETH,
        },
      ])
      // take 1% of the output to alice, then settle and take the rest to the caller
      v4Planner.addAction(Actions.TAKE_PORTION, [ETH_ADDRESS, alice.address, ONE_PERCENT_BIPS])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, ETH_ADDRESS])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const ethBalanceBeforeAlice: BigNumber = await ethers.provider.getBalance(alice.address)

      const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      const ethBalanceAfterAlice: BigNumber = await ethers.provider.getBalance(alice.address)

      const aliceFee = ethBalanceAfterAlice.sub(ethBalanceBeforeAlice)
      const bobEarnings = ethBalanceAfter.add(gasSpent).sub(ethBalanceBefore)
      const totalOut = aliceFee.add(bobEarnings)

      expect(totalOut).to.be.gte(minAmountOutWETH)
      expect(totalOut.mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
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
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [usdcContract.address, wethContract.address])

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
      // USDC -> WETH
      let currencyOut = wethContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([USDC_WETH.poolKey], currencyOut),
          amountOut: amountOutWETH,
          amountInMaximum: maxAmountInUSDC,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [usdcContract.address, wethContract.address])

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

    it('completes a v4 exactOut 2 hop swap', async () => {
      // DAI -> USDC -> WETH
      let currencyOut = wethContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyOut),
          amountOut: amountOutWETH,
          amountInMaximum: maxAmountInDAI,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [daiContract.address, wethContract.address])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutWETH)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.lte(maxAmountInDAI)
    })
  })
})
