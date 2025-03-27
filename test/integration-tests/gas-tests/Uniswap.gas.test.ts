import type { Contract } from '@ethersproject/contracts'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { Route as V2RouteSDK, Pair } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { SwapRouter, Trade } from '@uniswap/router-sdk'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployUniversalRouter from '../shared/deployUniversalRouter'
import { getPermitBatchSignature } from '../shared/protocolHelpers/permit2'
import {
  makePair,
  expandTo18Decimals,
  pool_DAI_WETH,
  pool_DAI_USDC,
  pool_USDC_WETH,
  pool_USDC_USDT,
  pool_WETH_USDT,
  encodePathExactOutput,
  encodePathExactInput,
} from '../shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { IPermit2, PoolManager, PositionManager, UniversalRouter } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { approveAndExecuteSwapRouter02, resetFork, WETH, DAI, USDC, USDT, PERMIT2 } from '../shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  ONE_PERCENT_BIPS,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from '../shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { RoutePlanner, CommandType } from '../shared/planner'
import { Actions, V4Planner } from '../shared/v4Planner'
import {
  addLiquidityToV4Pool,
  DAI_USDC,
  deployV4PoolManager,
  encodeMultihopExactInPath,
  initializeV4Pool,
  USDC_WETH,
  encodeMultihopExactOutPath,
  ETH_USDC,
  DAI_USDT,
  DAI_WETH,
} from '../shared/v4Helpers'
const { ethers } = hre

describe('Uniswap Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: IPermit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let usdtContract: Contract
  let planner: RoutePlanner
  let v4Planner: V4Planner
  // 6 pairs for gas tests with high numbers of trades
  let pair_DAI_WETH: Pair
  let pair_DAI_USDC: Pair
  let pair_USDC_WETH: Pair
  let v4PoolManager: PoolManager
  let v4PositionManager: PositionManager

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
    usdtContract = new ethers.Contract(USDT.address, TOKEN_ABI, bob)
    permit2 = PERMIT2.connect(bob) as IPermit2
    v4PoolManager = (await deployV4PoolManager(bob.address)).connect(bob) as PoolManager
    router = (await deployUniversalRouter(undefined, v4PoolManager.address)).connect(bob) as UniversalRouter
    v4PositionManager = (await ethers.getContractAt('PositionManager', await router.V4_POSITION_MANAGER())).connect(
      bob
    ) as PositionManager
    pair_DAI_WETH = await makePair(bob, DAI, WETH)
    pair_DAI_USDC = await makePair(bob, DAI, USDC)
    pair_USDC_WETH = await makePair(bob, USDC, WETH)

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(200000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(50000000))
    await usdtContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(50000000))
    // Bob max-approves the permit2 contract to access his DAI and WETH
    await daiContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdtContract.connect(bob).approve(permit2.address, MAX_UINT)
  })

  describe('Trade on UniswapV2', () => {
    describe('with Router02.', () => {
      const slippageTolerance = new Percent(10, 100)
      const recipient = '0x0000000000000000000000000000000000000003'

      let amountInDAI: CurrencyAmount<Token>
      let amountInETH: CurrencyAmount<Ether>
      let amountOut: CurrencyAmount<Token>
      let v2TradeExactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      let v2TradeExactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>

      beforeEach(async () => {
        amountInDAI = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
        amountInETH = CurrencyAmount.fromRawAmount(Ether.onChain(1), expandTo18Decimals(5))
        amountOut = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, one hop', async () => {
        v2TradeExactIn = await Trade.fromRoute(
          new V2RouteSDK([pair_DAI_WETH], DAI, WETH),
          amountInDAI,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v2TradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, two hops', async () => {
        v2TradeExactIn = await Trade.fromRoute(
          new V2RouteSDK([pair_DAI_USDC, pair_USDC_WETH], DAI, WETH),
          amountInDAI,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v2TradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ETH --> ERC20 exactIn, one trade, one hop', async () => {
        const trade = await Trade.fromRoute(
          new V2RouteSDK([pair_DAI_WETH], Ether.onChain(1), DAI),
          amountInETH,
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value, calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        v2TradeExactOut = await Trade.fromRoute(
          new V2RouteSDK([pair_DAI_WETH], WETH, DAI),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v2TradeExactOut, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, WETH, DAI, bob))
      })

      it('gas: ERC20 --> ETH exactOut ETH, one trade, one hop', async () => {
        const amountOutETH = CurrencyAmount.fromRawAmount(Ether.onChain(1), expandTo18Decimals(5))
        const trade = await Trade.fromRoute(
          new V2RouteSDK([pair_DAI_WETH], DAI, Ether.onChain(1)),
          amountOutETH,
          TradeType.EXACT_OUTPUT
        )
        const { calldata, value } = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value, calldata }, DAI, WETH, bob))
      })
    })

    describe('with Universal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      let planner: RoutePlanner

      beforeEach(async () => {
        planner = new RoutePlanner()
        // for these tests Bob gives the router max approval on permit2
        await permit2.connect(bob).approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.connect(bob).approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('ERC20 --> ERC20', () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)

        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops, MSG_SENDER flag', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, USDT.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, four hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, USDT.address, WETH.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, five hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, USDT.address, WETH.address, USDC.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops, no deadline', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            amountIn,
            1,
            [DAI.address, USDC.address, USDT.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[])'](commands, inputs))
        })

        it('gas: exactIn trade, where an output fee is taken', async () => {
          // back to the router so someone can take a fee
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            router.address,
            amountIn,
            1,
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.PAY_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
          planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 1])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDC.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            MSG_SENDER,
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDT.address, USDC.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            router.address,
            amountIn,
            1,
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])
          planner.addCommand(CommandType.SWEEP, [DAI.address, MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, with ETH fee', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, amountOut])
          planner.addCommand(CommandType.PAY_PORTION, [ETH_ADDRESS, MSG_SENDER, 50])
          planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          const minAmountOut = expandTo18DecimalsBN(0.001)
          const pairAddress = Pair.getAddress(DAI, WETH)
          planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
          // the money is already in the pair, so amountIn is 0
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            MSG_SENDER,
            0,
            minAmountOut,
            [WETH.address, DAI.address],
            SOURCE_MSG_SENDER,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const amountOut = expandTo18DecimalsBN(100)
          const value = expandTo18DecimalsBN(1)

          planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, value])
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            expandTo18DecimalsBN(1),
            [WETH.address, DAI.address],
            SOURCE_ROUTER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })
      })
    })
  })

  describe('Trade on UniswapV3', () => {
    describe('with Router02.', () => {
      const amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      const amountOut = CurrencyAmount.fromRawAmount(WETH, expandTo18Decimals(1))
      const slippageTolerance = new Percent(10, 100)

      let v3ExactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      let v3ExactInMultihop: Trade<Token, Token, TradeType.EXACT_INPUT>
      let v3ExactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>
      let v3ExactOutMultihop: Trade<Token, Token, TradeType.EXACT_OUTPUT>

      beforeEach(async () => {
        v3ExactIn = await Trade.fromRoute(new V3RouteSDK([pool_DAI_WETH], DAI, WETH), amountIn, TradeType.EXACT_INPUT)
        v3ExactOut = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_WETH], DAI, WETH),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactIn, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, two hops', async () => {
        v3ExactInMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactInMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, three hops', async () => {
        v3ExactInMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_USDT, pool_WETH_USDT], DAI, WETH),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactInMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOut, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, two hops', async () => {
        v3ExactOutMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOutMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, three hops', async () => {
        v3ExactOutMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_USDT, pool_WETH_USDT], DAI, WETH),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOutMultihop, {
          slippageTolerance,
          recipient: MSG_SENDER,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })
    })

    describe('with Universal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(500)
      const amountInMax: BigNumber = expandTo18DecimalsBN(5000)
      const amountOut: BigNumber = expandTo18DecimalsBN(1)

      const addV3ExactInTrades = (
        planner: RoutePlanner,
        numTrades: BigNumberish,
        amountOutMin: BigNumberish,
        recipient?: string,
        tokens: string[] = [DAI.address, WETH.address],
        sourceOfTokens: boolean = SOURCE_MSG_SENDER
      ) => {
        const path = encodePathExactInput(tokens)
        for (let i = 0; i < numTrades; i++) {
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            recipient ?? MSG_SENDER,
            amountIn,
            amountOutMin,
            path,
            sourceOfTokens,
          ])
        }
      }

      beforeEach(async () => {
        planner = new RoutePlanner()

        // for these tests Bob gives the router max approval on permit2
        await permit2.connect(bob).approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.connect(bob).approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('ERC20 --> ERC20', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          const amountOutMin: number = 0.0005 * 10 ** 18
          addV3ExactInTrades(planner, 1, amountOutMin)
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [DAI.address, WETH.address, USDC.address])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [
            DAI.address,
            WETH.address,
            USDT.address,
            USDC.address,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, four hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [
            DAI.address,
            WETH.address,
            USDT.address,
            USDC.address,
            WETH.address,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, five hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, [
            DAI.address,
            WETH.address,
            USDT.address,
            USDC.address,
            WETH.address,
            DAI.address,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, USDC.address, WETH.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, USDC.address, USDT.address, WETH.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            MSG_SENDER,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn swap 1 hop', async () => {
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin, router.address)
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap 2 hop', async () => {
          const tokens = [DAI.address, USDC.address, WETH.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin, router.address, tokens)
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap 3 hop', async () => {
          const tokens = [DAI.address, USDC.address, USDT.address, WETH.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin, router.address, tokens)
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, WETH.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            router.address,
            amountOut,
            amountInMax,
            path,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountIn])
          addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, tokens, SOURCE_ROUTER)

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountInMax])
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_ROUTER])
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountInMax })
          )
        })
      })
    })
  })

  describe('Trade on UniswapV4', () => {
    describe('with Universal Router', () => {
      // current market ETH price at block
      const USD_ETH_PRICE = 3820

      const amountIn = 1000
      const amountInUSDC: BigNumber = expandTo6DecimalsBN(amountIn)
      const amountInDAI: BigNumber = expandTo18DecimalsBN(amountIn)
      const amountInUSDT: BigNumber = expandTo6DecimalsBN(amountIn)
      const minAmountOutNative: BigNumber = expandTo18DecimalsBN(amountIn / Math.floor(USD_ETH_PRICE * 1.01))

      const amountInNative: BigNumber = expandTo18DecimalsBN(1.23)
      const minAmountOutUSD = Math.floor(USD_ETH_PRICE * 0.99 * 1.23)
      const minAmountOutUSDC: BigNumber = expandTo6DecimalsBN(minAmountOutUSD)

      const amountOut = 0.26
      const amountOutNative = expandTo18DecimalsBN(amountOut)
      const maxAmountInUSDC = expandTo18DecimalsBN(amountIn)
      const maxAmountInDAI = expandTo18DecimalsBN(amountOut * Math.floor(USD_ETH_PRICE * 1.01))

      const amountOutUSD = 2345
      const amountOutUSDC: BigNumber = expandTo6DecimalsBN(amountOutUSD)
      const maxAmountInNative: BigNumber = expandTo18DecimalsBN(amountOutUSD / Math.floor(USD_ETH_PRICE * 0.99))

      beforeEach(async () => {
        planner = new RoutePlanner()
        v4Planner = new V4Planner()

        // for these tests Bob gives the router max approval on permit2
        await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(USDC.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(USDT.address, router.address, MAX_UINT160, DEADLINE)

        // for setting up pools, bob gives position manager approval on permit2
        await permit2.approve(DAI.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
        await permit2.approve(WETH.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
        await permit2.approve(USDC.address, v4PositionManager.address, MAX_UINT160, DEADLINE)
        await permit2.approve(USDT.address, v4PositionManager.address, MAX_UINT160, DEADLINE)

        await initializeV4Pool(v4PoolManager, USDC_WETH.poolKey, USDC_WETH.price)
        await initializeV4Pool(v4PoolManager, DAI_USDC.poolKey, DAI_USDC.price)
        await initializeV4Pool(v4PoolManager, ETH_USDC.poolKey, ETH_USDC.price)
        await initializeV4Pool(v4PoolManager, DAI_WETH.poolKey, DAI_WETH.price)
        await initializeV4Pool(v4PoolManager, DAI_USDT.poolKey, DAI_USDT.price)

        await addLiquidityToV4Pool(v4PositionManager, USDC_WETH, expandTo18DecimalsBN(2).toString(), bob)
        await addLiquidityToV4Pool(v4PositionManager, DAI_USDC, expandTo18DecimalsBN(400).toString(), bob)
        await addLiquidityToV4Pool(v4PositionManager, ETH_USDC, expandTo18DecimalsBN(0.1).toString(), bob)
        await addLiquidityToV4Pool(v4PositionManager, DAI_WETH, expandTo18DecimalsBN(2).toString(), bob)
        await addLiquidityToV4Pool(v4PositionManager, DAI_USDT, expandTo18DecimalsBN(100).toString(), bob)
      })

      describe('ERC20 --> ERC20', () => {
        it('gas: exactIn, one trade, one hop', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          // USDT -> DAI -> USDC -> WETH
          let currencyIn = usdtContract.address
          v4Planner.addAction(Actions.SWAP_EXACT_IN, [
            {
              currencyIn,
              path: encodeMultihopExactInPath([DAI_USDT.poolKey, DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
              amountIn: amountInUSDT,
              amountOutMinimum: 0,
            },
          ])
          v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
          v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, four hops', async () => {
          // USDC -> WETH -> DAI -> USDC -> WETH
          let currencyIn = usdcContract.address
          v4Planner.addAction(Actions.SWAP_EXACT_IN, [
            {
              currencyIn,
              path: encodeMultihopExactInPath(
                [USDC_WETH.poolKey, DAI_WETH.poolKey, DAI_USDC.poolKey, USDC_WETH.poolKey],
                currencyIn
              ),
              amountIn: expandTo6DecimalsBN(100), // 100 USDC
              amountOutMinimum: 0,
            },
          ])
          v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
          v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, five hops', async () => {
          // USDC -> WETH -> DAI -> USDC -> WETH -> DAI
          let currencyIn = usdcContract.address
          v4Planner.addAction(Actions.SWAP_EXACT_IN, [
            {
              currencyIn,
              path: encodeMultihopExactInPath(
                [USDC_WETH.poolKey, DAI_WETH.poolKey, DAI_USDC.poolKey, USDC_WETH.poolKey, DAI_WETH.poolKey],
                currencyIn
              ),
              amountIn: expandTo6DecimalsBN(100), // 100 USDC
              amountOutMinimum: 0,
            },
          ])
          v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
          v4Planner.addAction(Actions.TAKE_ALL, [daiContract.address, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          // USDT -> DAI -> USDC -> WETH
          let currencyOut = wethContract.address
          v4Planner.addAction(Actions.SWAP_EXACT_OUT, [
            {
              currencyOut,
              path: encodeMultihopExactOutPath([DAI_USDT.poolKey, DAI_USDC.poolKey, USDC_WETH.poolKey], currencyOut),
              amountOut: amountOutNative,
              amountInMaximum: maxAmountInUSDC,
            },
          ])
          v4Planner.addAction(Actions.SETTLE_ALL, [usdtContract.address, MAX_UINT])
          v4Planner.addAction(Actions.TAKE_ALL, [wethContract.address, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn swap 1 hop', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap 2 hop', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap 3 hop', async () => {
          // USDT -> DAI -> USDC -> ETH
          let currencyIn = usdtContract.address
          v4Planner.addAction(Actions.SWAP_EXACT_IN, [
            {
              currencyIn,
              path: encodeMultihopExactInPath([DAI_USDT.poolKey, DAI_USDC.poolKey, ETH_USDC.poolKey], currencyIn),
              amountIn: amountInUSDT,
              amountOutMinimum: minAmountOutNative,
            },
          ])
          v4Planner.addAction(Actions.SETTLE_ALL, [currencyIn, MAX_UINT])
          v4Planner.addAction(Actions.TAKE_ALL, [ETH_ADDRESS, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn swap', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountInNative })
          )
        })

        it('gas: exactOut swap', async () => {
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
          v4Planner.addAction(Actions.TAKE_ALL, [usdcContract.address, 0])

          planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])
          // sweep excess ETH leftover back to the caller!
          planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: maxAmountInNative })
          )
        })
      })
    })
  })

  describe('Mixing V2 and V3', () => {
    describe('with Universal Router.', () => {
      beforeEach(async () => {
        planner = new RoutePlanner()

        // Bob max-approves the permit2 contract to access his DAI and WETH
        await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('Interleaving routes', () => {
        it('gas: V3, then V2', async () => {
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
          // the tokens are already int he v2 pair, so amountIn is 0
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, v2AmountOutMin, v2Tokens, SOURCE_MSG_SENDER])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: V2, then V3', async () => {
          const v2Tokens = [DAI.address, USDC.address]
          const v3Tokens = [USDC.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
          const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
          const v3AmountOutMin = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            router.address,
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('Split routes', () => {
        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit transfer from batch', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, each two hop, without explicit permit', async () => {
          // this test is the same as the above test, but instead of a permit permit, separate permits within the 2 trades
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, different input tokens, each two hop, with batch permit', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)

          // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [router.address, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
          // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V3, one hop, ADDRESS_THIS flag', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)

          // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
          // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ETH --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [WETH.address, USDC.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
          const value = v2AmountIn.add(v3AmountIn)

          planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, value])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [router.address, v2AmountIn, 0, tokens, SOURCE_ROUTER])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_ROUTER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [USDC.address, MSG_SENDER, 0.0005 * 10 ** 6])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })

        it('gas: ERC20 --> ETH split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(20)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(30)

          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [router.address, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ETH split V2 and V3, exactOut, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountOut: BigNumber = expandTo18DecimalsBN(0.5)
          const v3AmountOut: BigNumber = expandTo18DecimalsBN(1)
          const path = encodePathExactOutput(tokens)
          const maxAmountIn = expandTo18DecimalsBN(4000)
          const fullAmountOut = v2AmountOut.add(v3AmountOut)

          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            router.address,
            v2AmountOut,
            maxAmountIn,
            [DAI.address, WETH.address],
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            router.address,
            v3AmountOut,
            maxAmountIn,
            path,
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, fullAmountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
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

        it('gas: 2 sub-plans, neither fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, the first fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, both fail but the transaction succeeds', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: 2 sub-plans, second sub plan fails', async () => {
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

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })
    })
  })
})
