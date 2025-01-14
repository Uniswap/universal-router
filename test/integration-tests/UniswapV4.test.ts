import type { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { expect } from './shared/expect'
import { IPermit2, PoolManager, PositionManager, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, PERMIT2 } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  ONE_PERCENT_BIPS,
  OPEN_DELTA,
} from './shared/constants'
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

  // current market ETH price at block
  const USD_ETH_PRICE = 3820

  // USD-pegged -> (W)NATIVE trades
  // exact in trade
  const amountIn = 1000
  const amountInUSDC: BigNumber = expandTo6DecimalsBN(amountIn)
  const amountInDAI: BigNumber = expandTo18DecimalsBN(amountIn)
  const minAmountOutNative: BigNumber = expandTo18DecimalsBN(amountIn / Math.floor(USD_ETH_PRICE * 1.01))

  // exact out trade
  const amountOut = 0.26
  const amountOutNative = expandTo18DecimalsBN(amountOut)
  const maxAmountInUSDC = expandTo6DecimalsBN(amountOut * Math.floor(USD_ETH_PRICE * 1.01))
  const maxAmountInDAI = expandTo18DecimalsBN(amountOut * Math.floor(USD_ETH_PRICE * 1.01))

  // (W)NATIVE -> USD-pegged trades
  // exact in trade
  const amountInNative: BigNumber = expandTo18DecimalsBN(1.23)
  const minAmountOutUSD = Math.floor(USD_ETH_PRICE * 0.99 * 1.23)
  const minAmountOutUSDC: BigNumber = expandTo6DecimalsBN(minAmountOutUSD)
  const minAmountOutDAI: BigNumber = expandTo18DecimalsBN(minAmountOutUSD)

  // exact out trade
  const amountOutUSD = 2345
  const amountOutUSDC: BigNumber = expandTo6DecimalsBN(amountOutUSD)
  const amountOutDAI: BigNumber = expandTo18DecimalsBN(amountOutUSD)
  const maxAmountInNative: BigNumber = expandTo18DecimalsBN(amountOutUSD / Math.floor(USD_ETH_PRICE * 0.99))

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
    v4PoolManager = (await deployV4PoolManager(bob.address)).connect(bob) as PoolManager
    router = (await deployUniversalRouter(undefined, v4PoolManager.address)).connect(bob) as UniversalRouter
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
          amountOutMinimum: minAmountOutNative,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutNative)
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
          amountOutMinimum: minAmountOutNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutNative)
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
          amountOutMinimum: minAmountOutNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutNative)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountInDAI)
    })

    it('completes a v4 exactIn 2 hop swap, with take portion on output', async () => {
      // DAI -> USDC -> WETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutNative,
        },
      ])
      // take 1% of the output to alice, then settle and take the rest to the caller
      v4Planner.addAction(Actions.TAKE_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

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

      expect(totalOut).to.be.gte(minAmountOutNative)
      expect(totalOut.mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
    })

    it('completes a v4 exactIn 2 hop swap, with take portion on input', async () => {
      // DAI -> USDC -> WETH
      let currencyIn = daiContract.address
      // trade is 1% less than previously, so adjust expected output
      let minOut = minAmountOutNative.mul(99).div(100)

      // settle the input tokens to the pool manager
      v4Planner.addAction(Actions.SETTLE, [currencyIn, amountInDAI, true])
      // take 1% of the input tokens
      v4Planner.addAction(Actions.TAKE_PORTION, [currencyIn, alice.address, ONE_PERCENT_BIPS])
      // swap using the OPEN_DELTA as input amount
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
          amountIn: OPEN_DELTA,
          amountOutMinimum: minOut,
        },
      ])
      // take the output weth
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, minOut])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const daiBalanceBeforeAlice = await daiContract.balanceOf(alice.address)

      const { daiBalanceBefore, daiBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      const daiBalanceAfterAlice = await daiContract.balanceOf(alice.address)

      const aliceFee = daiBalanceAfterAlice.sub(daiBalanceBeforeAlice)
      const bobSpent = daiBalanceBefore.sub(daiBalanceAfter)

      expect(bobSpent.mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
    })

    it('completes a v4 exactIn 2 hop swap, with take portion native', async () => {
      // DAI -> USDC -> ETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, ETH_USDC.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutNative,
        },
      ])
      // take 1% of the output to alice, then settle and take the rest to the caller
      v4Planner.addAction(Actions.TAKE_PORTION, [ETH_ADDRESS, alice.address, ONE_PERCENT_BIPS])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])

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

      expect(totalOut).to.be.gte(minAmountOutNative)
      expect(totalOut.mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
    })

    it('completes a v4 exactOutSingle swap', async () => {
      v4Planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInUSDC,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutNative)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
    })

    it('completes a v4 exactOut 1 hop swap', async () => {
      // USDC -> WETH
      let currencyOut = wethContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([USDC_WETH.poolKey], currencyOut),
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInUSDC,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutNative)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
    })

    it('completes a v4 exactOut 2 hop swap', async () => {
      // DAI -> USDC -> WETH
      let currencyOut = wethContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyOut),
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInDAI,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [daiContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutNative)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.lte(maxAmountInDAI)
    })
  })

  describe('ETH --> ERC20', () => {
    it('completes a v4 exactInSingle swap', async () => {
      v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: ETH_USDC.poolKey,
          zeroForOne: true,
          amountIn: amountInNative,
          amountOutMinimum: minAmountOutUSDC,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [ETH_ADDRESS, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [usdcContract.address, 0])
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        amountInNative // pass in the ETH to the call
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.eq(amountInNative.add(gasSpent))
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOutUSDC)
    })

    it('completes a v4 exactIn 1 hop swap', async () => {
      // ETH -> USDC
      let currencyIn = ETH_ADDRESS
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([ETH_USDC.poolKey], currencyIn),
          amountIn: amountInNative,
          amountOutMinimum: minAmountOutUSDC,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [usdcContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        amountInNative // pass in the ETH to the call
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.eq(amountInNative.add(gasSpent))
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOutUSDC)
    })

    it('completes a v4 exactIn 2 hop swap', async () => {
      // ETH -> USDC -> DAI
      let currencyIn = ETH_ADDRESS
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([ETH_USDC.poolKey, DAI_USDC.poolKey], currencyIn),
          amountIn: amountInNative,
          amountOutMinimum: minAmountOutDAI,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [daiContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        amountInNative // pass in the ETH to the call
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gte(minAmountOutDAI)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.eq(amountInNative.add(gasSpent))
    })

    it('completes a v4 exactOutSingle swap', async () => {
      // ETH -> USDC
      v4Planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
        {
          poolKey: ETH_USDC.poolKey,
          zeroForOne: true,
          amountOut: amountOutUSDC,
          amountInMaximum: maxAmountInNative,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [ETH_ADDRESS, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [usdcContract.address, 0])
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])
      // sweep excess ETH leftover back to the caller!
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        maxAmountInNative // send in the max amount of ETH
      )

      // no eth left in the router
      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.lte(maxAmountInNative.add(gasSpent))
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.eq(amountOutUSDC)
    })

    it('completes a v4 exactOut 1 hop swap', async () => {
      // ETH -> USDC
      let currencyOut = usdcContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([ETH_USDC.poolKey], currencyOut),
          amountOut: amountOutUSDC,
          amountInMaximum: maxAmountInNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [ETH_ADDRESS, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [currencyOut, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])
      // sweep excess ETH leftover back to the caller!
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        maxAmountInNative // send in the max amount of ETH
      )

      // no eth left in the router
      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.lte(maxAmountInNative.add(gasSpent))
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.eq(amountOutUSDC)
    })

    it('completes a v4 exactOut 2 hop swap', async () => {
      // ETH -> USDC -> DAI
      let currencyOut = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([ETH_USDC.poolKey, DAI_USDC.poolKey], currencyOut),
          amountOut: amountOutDAI,
          amountInMaximum: maxAmountInNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [ETH_ADDRESS, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [daiContract.address, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])
      // sweep excess ETH leftover back to the caller!
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

      const { daiBalanceBefore, daiBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        maxAmountInNative // send in the max amount of ETH
      )

      // no eth left in the router
      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.be.lte(maxAmountInNative.add(gasSpent))
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.eq(amountOutDAI)
    })
  })

  describe('ERC20 --> ETH', () => {
    it('completes a v4 exactInSingle swap', async () => {
      // USDC -> ETH
      v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: ETH_USDC.poolKey,
          zeroForOne: false,
          amountIn: amountInUSDC,
          amountOutMinimum: minAmountOutNative,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.eq(amountInUSDC)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.gte(minAmountOutNative.sub(gasSpent))
    })

    it('completes a v4 exactIn 1 hop swap', async () => {
      // USDC -> ETH
      let currencyIn = usdcContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([ETH_USDC.poolKey], currencyIn),
          amountIn: amountInUSDC,
          amountOutMinimum: minAmountOutNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.eq(amountInUSDC)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.gte(minAmountOutNative.sub(gasSpent))
    })

    it('completes a v4 exactIn 2 hop swap', async () => {
      // DAI -> USDC -> ETH
      let currencyIn = daiContract.address
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath([DAI_USDC.poolKey, ETH_USDC.poolKey], currencyIn),
          amountIn: amountInDAI,
          amountOutMinimum: minAmountOutNative,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountInDAI)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.gte(minAmountOutNative.sub(gasSpent))
    })

    it('completes a v4 exactOutSingle swap', async () => {
      // USDC -> ETH
      v4Planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
        {
          poolKey: ETH_USDC.poolKey,
          zeroForOne: false,
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInUSDC,
          hookData: '0x',
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.eq(amountOutNative.sub(gasSpent))
    })

    it('completes a v4 exactOut 1 hop swap', async () => {
      // USDC -> ETH
      let currencyOut = ETH_ADDRESS
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([ETH_USDC.poolKey], currencyOut),
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInUSDC,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [usdcContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [currencyOut, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { usdcBalanceBefore, usdcBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.lte(maxAmountInUSDC)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.eq(amountOutNative.sub(gasSpent))
    })

    it('completes a v4 exactOut 2 hop swap', async () => {
      // DAI -> USDC -> ETH
      let currencyOut = ETH_ADDRESS
      v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut,
          path: encodeMultihopExactOutPath([DAI_USDC.poolKey, ETH_USDC.poolKey], currencyOut),
          amountOut: amountOutNative,
          amountInMaximum: maxAmountInDAI,
        },
      ])
      v4Planner.addAction(Actions.SETTLE_ALL, [daiContract.address, MAX_UINT])
      v4Planner.addAction(Actions.TAKE_ALL, [currencyOut, 0])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

      const { daiBalanceBefore, daiBalanceAfter, ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(await ethers.provider.getBalance(router.address)).to.be.eq(0)
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.eq(amountOutNative.sub(gasSpent))
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.lte(maxAmountInDAI)
    })
  })
})
