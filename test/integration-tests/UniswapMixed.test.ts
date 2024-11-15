import type { Contract } from '@ethersproject/contracts'
import { Pair } from '@uniswap/v2-sdk'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { IPermit2, PoolManager, PositionManager, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, USDT, PERMIT2 } from './shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  OPEN_DELTA,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { getPermitBatchSignature } from './shared/protocolHelpers/permit2'
import { encodePathExactInput, encodePathExactOutput } from './shared/swapRouter02Helpers'
import { executeRouter } from './shared/executeRouter'
import { Actions, V4Planner } from './shared/v4Planner'
import {
  addLiquidityToV4Pool,
  DAI_USDC,
  deployV4PoolManager,
  encodeMultihopExactInPath,
  ETH_USDC,
  initializeV4Pool,
  USDC_WETH,
} from './shared/v4Helpers'
const { ethers } = hre

describe('Uniswap V2, V3, and V4 Tests:', () => {
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

  describe('Interleaving routes', () => {
    it('V3, then V2', async () => {
      const v3Tokens = [DAI.address, USDC.address]
      const v2Tokens = [USDC.address, WETH.address]
      const v3AmountIn: BigNumber = expandTo18DecimalsBN(5)
      const v3AmountOutMin = 0
      const v2AmountOutMin = expandTo18DecimalsBN(0.0005)

      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        Pair.getAddress(USDC, WETH),
        v3AmountIn,
        v3AmountOutMin,
        encodePathExactInput(v3Tokens),
        SOURCE_MSG_SENDER,
      ])
      // amountIn of 0 because the USDC is already in the pair
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, v2AmountOutMin, v2Tokens, SOURCE_MSG_SENDER])

      const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1Out: wethTraded } = v2SwapEventArgs!
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded)
    })

    it('V2, then V3', async () => {
      const v2Tokens = [DAI.address, USDC.address]
      const v3Tokens = [USDC.address, WETH.address]
      const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
      const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
      const v3AmountOutMin = expandTo18DecimalsBN(0.0005)

      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        v2AmountIn,
        v2AmountOutMin,
        v2Tokens,
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        MSG_SENDER,
        CONTRACT_BALANCE,
        v3AmountOutMin,
        encodePathExactInput(v3Tokens),
        SOURCE_ROUTER,
      ])

      const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1: wethTraded } = v3SwapEventArgs!
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded.mul(-1))
    })
  })

  describe('Split routes', () => {
    it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit transfer from', async () => {
      const route1 = [DAI.address, USDC.address, WETH.address]
      const route2 = [DAI.address, USDT.address, WETH.address]
      const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
      const minAmountOut1 = expandTo18DecimalsBN(0.005)
      const minAmountOut2 = expandTo18DecimalsBN(0.0075)

      // 1) transfer funds into DAI-USDC and DAI-USDT pairs to trade
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [DAI.address, Pair.getAddress(DAI, USDC), v2AmountIn1])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [DAI.address, Pair.getAddress(DAI, USDT), v2AmountIn2])

      // 2) trade route1 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
      // 3) trade route2 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
    })

    it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit transfer from batch', async () => {
      const route1 = [DAI.address, USDC.address, WETH.address]
      const route2 = [DAI.address, USDT.address, WETH.address]
      const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
      const minAmountOut1 = expandTo18DecimalsBN(0.005)
      const minAmountOut2 = expandTo18DecimalsBN(0.0075)

      const BATCH_TRANSFER = [
        {
          from: bob.address,
          to: Pair.getAddress(DAI, USDC),
          amount: v2AmountIn1,
          token: DAI.address,
        },
        {
          from: bob.address,
          to: Pair.getAddress(DAI, USDT),
          amount: v2AmountIn2,
          token: DAI.address,
        },
      ]

      // 1) transfer funds into DAI-USDC and DAI-USDT pairs to trade
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

      // 2) trade route1 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
      // 3) trade route2 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
    })

    it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, without explicit permit', async () => {
      const route1 = [DAI.address, USDC.address, WETH.address]
      const route2 = [DAI.address, USDT.address, WETH.address]
      const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
      const minAmountOut1 = expandTo18DecimalsBN(0.005)
      const minAmountOut2 = expandTo18DecimalsBN(0.0075)

      // 1) trade route1 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        v2AmountIn1,
        minAmountOut1,
        route1,
        SOURCE_MSG_SENDER,
      ])
      // 2) trade route2 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        v2AmountIn2,
        minAmountOut2,
        route2,
        SOURCE_MSG_SENDER,
      ])

      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
    })

    it('PERMIT2 batch can silently fail', async () => {
      const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v2AmountIn2: BigNumber = expandTo18DecimalsBN(5)

      const BATCH_PERMIT = {
        details: [
          {
            token: DAI.address,
            amount: v2AmountIn1,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          {
            token: WETH.address,
            amount: v2AmountIn2,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
        ],
        spender: router.address,
        sigDeadline: DEADLINE,
      }

      const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

      // transfer funds into DAI-USDC and DAI-USDT pairs to trade
      // do not allow revert
      planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

      // allow revert
      planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig], true)

      let nonce = (await permit2.allowance(bob.address, DAI.address, router.address)).nonce
      expect(nonce).to.eq(0)

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      nonce = (await permit2.allowance(bob.address, DAI.address, router.address)).nonce
      expect(nonce).to.eq(1)
    })

    it('ERC20 --> ERC20 split V2 and V2 different routes, different input tokens, each two hop, with batch permit', async () => {
      const route1 = [DAI.address, WETH.address, USDC.address]
      const route2 = [WETH.address, DAI.address, USDC.address]
      const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v2AmountIn2: BigNumber = expandTo18DecimalsBN(5)
      const minAmountOut1 = BigNumber.from(0.005 * 10 ** 6)
      const minAmountOut2 = BigNumber.from(0.0075 * 10 ** 6)

      const BATCH_PERMIT = {
        details: [
          {
            token: DAI.address,
            amount: v2AmountIn1,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          {
            token: WETH.address,
            amount: v2AmountIn2,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
        ],
        spender: router.address,
        sigDeadline: DEADLINE,
      }

      const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

      // 1) transfer funds into DAI-USDC and DAI-USDT pairs to trade
      planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

      // 2) trade route1 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        v2AmountIn1,
        minAmountOut1,
        route1,
        SOURCE_MSG_SENDER,
      ])
      // 3) trade route2 and return tokens to bob
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        v2AmountIn2,
        minAmountOut2,
        route2,
        SOURCE_MSG_SENDER,
      ])

      const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
    })

    it('ERC20 --> ERC20 V3 trades with different input tokens with batch permit and batch transfer', async () => {
      const route1 = [DAI.address, WETH.address]
      const route2 = [WETH.address, USDC.address]
      const v3AmountIn1: BigNumber = expandTo18DecimalsBN(20)
      const v3AmountIn2: BigNumber = expandTo18DecimalsBN(5)
      const minAmountOut1WETH = BigNumber.from(0)
      const minAmountOut1USDC = BigNumber.from(0.005 * 10 ** 6)
      const minAmountOut2USDC = BigNumber.from(0.0075 * 10 ** 6)

      const BATCH_PERMIT = {
        details: [
          {
            token: DAI.address,
            amount: v3AmountIn1,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          {
            token: WETH.address,
            amount: v3AmountIn2,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
        ],
        spender: router.address,
        sigDeadline: DEADLINE,
      }

      const BATCH_TRANSFER = [
        {
          from: bob.address,
          to: router.address,
          amount: v3AmountIn1,
          token: DAI.address,
        },
        {
          from: bob.address,
          to: router.address,
          amount: v3AmountIn2,
          token: WETH.address,
        },
      ]

      const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

      // 1) permit dai and weth to be spent by router
      planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

      // 2) transfer dai and weth into router to use contract balance
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

      // v3SwapExactInput(recipient, amountIn, amountOutMin, path, payer);

      // 2) trade route1 and return tokens to router for the second trade
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        CONTRACT_BALANCE,
        minAmountOut1WETH,
        encodePathExactInput(route1),
        SOURCE_ROUTER,
      ])
      // 3) trade route2 and return tokens to bob
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        MSG_SENDER,
        CONTRACT_BALANCE,
        minAmountOut1USDC.add(minAmountOut2USDC),
        encodePathExactInput(route2),
        SOURCE_ROUTER,
      ])

      const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1USDC.add(minAmountOut2USDC))
    })

    it('ERC20 --> ERC20 split V2 and V3, one hop', async () => {
      const tokens = [DAI.address, WETH.address]
      const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
      const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
      const minAmountOut = expandTo18DecimalsBN(0.0005)

      // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
      // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        v3AmountIn,
        0,
        encodePathExactInput(tokens),
        SOURCE_MSG_SENDER,
      ])
      // aggregate slippage check
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, minAmountOut])

      const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1Out: wethOutV2 } = v2SwapEventArgs!
      let { amount1: wethOutV3 } = v3SwapEventArgs!

      // expect(daiBalanceBefore.sub(daiBalanceAfter)).to.eq(v2AmountIn.add(v3AmountIn)) // TODO: with permit2 can check from alice's balance
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethOutV2.sub(wethOutV3))
    })

    it('ETH --> ERC20 split V2 and V3, one hop', async () => {
      const tokens = [WETH.address, USDC.address]
      const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
      const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
      const value = v2AmountIn.add(v3AmountIn)

      planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, value])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_ROUTER])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        v3AmountIn,
        0,
        encodePathExactInput(tokens),
        SOURCE_MSG_SENDER,
      ])
      // aggregate slippage check
      planner.addCommand(CommandType.SWEEP, [USDC.address, MSG_SENDER, 0.0005 * 10 ** 6])

      const { usdcBalanceBefore, usdcBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        value
      )
      const { amount0Out: usdcOutV2 } = v2SwapEventArgs!
      let { amount0: usdcOutV3 } = v3SwapEventArgs!
      usdcOutV3 = usdcOutV3.mul(-1)
      expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.eq(usdcOutV2.add(usdcOutV3))
    })

    it('ERC20 --> ETH split V2 and V3, one hop', async () => {
      const tokens = [DAI.address, WETH.address]
      const v2AmountIn: BigNumber = expandTo18DecimalsBN(20)
      const v3AmountIn: BigNumber = expandTo18DecimalsBN(30)

      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        v3AmountIn,
        0,
        encodePathExactInput(tokens),
        SOURCE_MSG_SENDER,
      ])
      // aggregate slippage check
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, expandTo18DecimalsBN(0.0005)])

      const { ethBalanceBefore, ethBalanceAfter, gasSpent, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1Out: wethOutV2 } = v2SwapEventArgs!
      let { amount1: wethOutV3 } = v3SwapEventArgs!
      wethOutV3 = wethOutV3.mul(-1)

      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethOutV2.add(wethOutV3).sub(gasSpent))
    })

    it('ERC20 --> ETH split V2 and V3, exactOut, one hop', async () => {
      const tokens = [DAI.address, WETH.address]
      const v2AmountOut: BigNumber = expandTo18DecimalsBN(0.5)
      const v3AmountOut: BigNumber = expandTo18DecimalsBN(1)
      const path = encodePathExactOutput(tokens)
      const maxAmountIn = expandTo18DecimalsBN(4000)
      const fullAmountOut = v2AmountOut.add(v3AmountOut)

      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        ADDRESS_THIS,
        v2AmountOut,
        maxAmountIn,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
        ADDRESS_THIS,
        v3AmountOut,
        maxAmountIn,
        path,
        SOURCE_MSG_SENDER,
      ])
      // aggregate slippage check
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, fullAmountOut])

      const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      // TODO: permit2 test alice doesn't send more than maxAmountIn DAI
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(fullAmountOut.sub(gasSpent))
    })

    it('ERC20 --> ERC20 split V4 and V4 different routes, with wrap, aggregate slippage', async () => {
      // route 1: DAI -> USDC -> WETH
      // route 2: DAI -> USDC -> ETH, then router wraps ETH -> WETH
      const route1 = [DAI_USDC.poolKey, USDC_WETH.poolKey]
      const route2 = [DAI_USDC.poolKey, ETH_USDC.poolKey]
      const v4AmountIn1 = expandTo18DecimalsBN(100)
      const v4AmountIn2 = expandTo18DecimalsBN(150)
      const aggregateMinOut = expandTo18DecimalsBN(250 / Math.floor(USD_ETH_PRICE * 1.01))

      let currencyIn = daiContract.address
      // add first split to v4 planner
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath(route1, currencyIn),
          amountIn: v4AmountIn1,
          amountOutMinimum: 0,
        },
      ])
      // add second split to v4 planner
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn,
          path: encodeMultihopExactInPath(route2, currencyIn),
          amountIn: v4AmountIn2,
          amountOutMinimum: 0,
        },
      ])
      // settle all DAI with no limit
      v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, v4AmountIn1.add(v4AmountIn2)])
      // take all the WETH and all the ETH into the router
      v4Planner.addAction(Actions.TAKE, [WETH.address, ADDRESS_THIS, OPEN_DELTA])
      v4Planner.addAction(Actions.TAKE, [ETH_ADDRESS, ADDRESS_THIS, OPEN_DELTA])

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])
      // wrap all the ETH into WETH
      planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, CONTRACT_BALANCE])
      // now we can send the WETH to the user, with aggregate slippage check
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, aggregateMinOut])

      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(aggregateMinOut)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(v4AmountIn1.add(v4AmountIn2))
    })

    describe('Batch reverts', () => {
      let subplan: RoutePlanner
      const planOneTokens = [DAI.address, WETH.address]
      const planTwoTokens = [USDC.address, WETH.address]
      const planOneV2AmountIn: BigNumber = expandTo18DecimalsBN(2)
      const planOneV3AmountIn: BigNumber = expandTo18DecimalsBN(3)
      const planTwoV3AmountIn = expandTo6DecimalsBN(5)

      beforeEach(async () => {
        subplan = new RoutePlanner()
      })

      it('2 sub-plans, neither fails', async () => {
        // first split route sub-plan. DAI->WETH, 2 routes on V2 and V3.
        const planOneWethMinOut = expandTo18DecimalsBN(0.0005)

        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        subplan.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV2AmountIn,
          0,
          planOneTokens,
          SOURCE_MSG_SENDER,
        ])
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV3AmountIn,
          0,
          encodePathExactInput(planOneTokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        subplan.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, planOneWethMinOut])

        // add the subplan to the main planner
        planner.addSubPlan(subplan)
        subplan = new RoutePlanner()

        // second split route sub-plan. USDC->WETH, 1 route on V3
        const wethMinAmountOut2 = expandTo18DecimalsBN(0.0005)

        // Add the trade to the sub-plan
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          planTwoV3AmountIn,
          wethMinAmountOut2,
          encodePathExactInput(planTwoTokens),
          SOURCE_MSG_SENDER,
        ])

        // add the second subplan to the main planner
        planner.addSubPlan(subplan)

        const { usdcBalanceBefore, usdcBalanceAfter, daiBalanceBefore, daiBalanceAfter } = await executeRouter(
          planner,
          bob,
          router,
          wethContract,
          daiContract,
          usdcContract
        )

        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.eq(planOneV2AmountIn.add(planOneV3AmountIn))
        expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.eq(planTwoV3AmountIn)
      })

      it('2 sub-plans, the first fails', async () => {
        // first split route sub-plan. DAI->WETH, 2 routes on V2 and V3.
        // FAIL: large weth amount out to cause a failure
        const planOneWethMinOut = expandTo18DecimalsBN(1)

        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        subplan.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV2AmountIn,
          0,
          planOneTokens,
          SOURCE_MSG_SENDER,
        ])
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV3AmountIn,
          0,
          encodePathExactInput(planOneTokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        subplan.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, planOneWethMinOut])

        // add the subplan to the main planner
        planner.addSubPlan(subplan)
        subplan = new RoutePlanner()

        // second split route sub-plan. USDC->WETH, 1 route on V3
        const wethMinAmountOut2 = expandTo18DecimalsBN(0.0005)

        // Add the trade to the sub-plan
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          planTwoV3AmountIn,
          wethMinAmountOut2,
          encodePathExactInput(planTwoTokens),
          SOURCE_MSG_SENDER,
        ])

        // add the second subplan to the main planner
        planner.addSubPlan(subplan)

        const { usdcBalanceBefore, usdcBalanceAfter, daiBalanceBefore, daiBalanceAfter } = await executeRouter(
          planner,
          bob,
          router,
          wethContract,
          daiContract,
          usdcContract
        )

        // dai balance should be unchanged as the weth sweep failed
        expect(daiBalanceBefore).to.eq(daiBalanceAfter)

        // usdc is the second trade so the balance has changed
        expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.eq(planTwoV3AmountIn)
      })

      it('2 sub-plans, both fail but the transaction succeeds', async () => {
        // first split route sub-plan. DAI->WETH, 2 routes on V2 and V3.
        // FAIL: large amount out to cause the swap to revert
        const planOneWethMinOut = expandTo18DecimalsBN(1)

        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        subplan.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV2AmountIn,
          0,
          planOneTokens,
          SOURCE_MSG_SENDER,
        ])
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV3AmountIn,
          0,
          encodePathExactInput(planOneTokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        subplan.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, planOneWethMinOut])

        // add the subplan to the main planner
        planner.addSubPlan(subplan)
        subplan = new RoutePlanner()

        // second split route sub-plan. USDC->WETH, 1 route on V3
        // FAIL: large amount out to cause the swap to revert
        const wethMinAmountOut2 = expandTo18DecimalsBN(1)

        // Add the trade to the sub-plan
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          planTwoV3AmountIn,
          wethMinAmountOut2,
          encodePathExactInput(planTwoTokens),
          SOURCE_MSG_SENDER,
        ])

        // add the second subplan to the main planner
        planner.addSubPlan(subplan)

        const { usdcBalanceBefore, usdcBalanceAfter, daiBalanceBefore, daiBalanceAfter } = await executeRouter(
          planner,
          bob,
          router,
          wethContract,
          daiContract,
          usdcContract
        )

        // dai and usdc balances both unchanged because both trades failed
        expect(daiBalanceBefore).to.eq(daiBalanceAfter)
        expect(usdcBalanceBefore).to.eq(usdcBalanceAfter)
      })

      it('2 sub-plans, second sub plan fails', async () => {
        // first split route sub-plan. DAI->WETH, 2 routes on V2 and V3.
        const planOneWethMinOut = expandTo18DecimalsBN(0.0005)

        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        subplan.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV2AmountIn,
          0,
          planOneTokens,
          SOURCE_MSG_SENDER,
        ])
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          planOneV3AmountIn,
          0,
          encodePathExactInput(planOneTokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        subplan.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, planOneWethMinOut])

        // add the subplan to the main planner
        planner.addSubPlan(subplan)
        subplan = new RoutePlanner()

        // second split route sub-plan. USDC->WETH, 1 route on V3
        // FAIL: large amount out to cause the swap to revert
        const wethMinAmountOut2 = expandTo18DecimalsBN(1)

        // Add the trade to the sub-plan
        subplan.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          planTwoV3AmountIn,
          wethMinAmountOut2,
          encodePathExactInput(planTwoTokens),
          SOURCE_MSG_SENDER,
        ])

        // add the second subplan to the main planner
        planner.addSubPlan(subplan)

        const { usdcBalanceBefore, usdcBalanceAfter, daiBalanceBefore, daiBalanceAfter } = await executeRouter(
          planner,
          bob,
          router,
          wethContract,
          daiContract,
          usdcContract
        )

        // dai balance has changed as this trade should succeed
        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.eq(planOneV2AmountIn.add(planOneV3AmountIn))

        // usdc is unchanged as the second trade should have failed
        expect(usdcBalanceBefore).to.eq(usdcBalanceAfter)
      })
    })
  })
})
