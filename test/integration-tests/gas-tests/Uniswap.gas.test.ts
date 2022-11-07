import type { Contract } from '@ethersproject/contracts'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { Route as V2RouteSDK, Pair } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK, FeeAmount } from '@uniswap/v3-sdk'
import { SwapRouter, Trade } from '@uniswap/router-sdk'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
import {
  makePair,
  expandTo18Decimals,
  encodePath,
  pool_DAI_WETH,
  pool_DAI_USDC,
  pool_USDC_WETH,
  pool_USDC_USDT,
  pool_WETH_USDT,
} from '../shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { Router, Permit2 } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'
import { approveAndExecuteSwapRouter02, resetFork, WETH, DAI, USDC, USDT } from '../shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  ONE_PERCENT_BIPS,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from '../shared/constants'
import { expandTo18DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { RoutePlanner, CommandType } from '../shared/planner'
import { constructBatchTransferFromCalldata, TransferDetail } from '../shared/protocolHelpers/permit2'
const { ethers } = hre

function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

function encodePathExactOutput(tokens: string[]) {
  return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

describe('Uniswap Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let daiContract: Contract
  let wethContract: Contract
  let planner: RoutePlanner

  // 6 pairs for gas tests with high numbers of trades
  let pair_DAI_WETH: Pair
  let pair_DAI_USDC: Pair
  let pair_USDC_WETH: Pair

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
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployRouter(permit2)).connect(bob) as Router
    pair_DAI_WETH = await makePair(bob, DAI, WETH)
    pair_DAI_USDC = await makePair(bob, DAI, USDC)
    pair_USDC_WETH = await makePair(bob, USDC, WETH)

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))

    // Bob max-approves the permit2 contract to access his DAI and WETH
    await daiContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
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

    describe('with Narwhal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      let planner: RoutePlanner

      beforeEach(async () => {
        planner = new RoutePlanner()
        // for these tests Bob gives the router max approval on permit2
        await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
      })

      describe('ERC20 --> ERC20', () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)

        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            minAmountOut,
            [DAI.address, WETH.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, two hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, WETH.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            minAmountOut,
            [DAI.address, USDC.address, USDT.address, WETH.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops, no deadline', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            1,
            [DAI.address, USDC.address, USDT.address, WETH.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[])'](commands, inputs))
        })

        it('gas: exactIn trade, where an output fee is taken', async () => {
          // back to the router so someone can take a fee
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            1,
            [DAI.address, WETH.address],
            router.address,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.PAY_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
          planner.addCommand(CommandType.SWEEP, [WETH.address, bob.address, 1])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, DAI.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, two hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDC.address, DAI.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, three hops', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDT.address, USDC.address, DAI.address],
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn, one trade, one hop', async () => {
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            amountIn,
            1,
            [DAI.address, WETH.address],
            router.address,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, CONTRACT_BALANCE])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            router.address,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, amountOut])
          planner.addCommand(CommandType.SWEEP, [DAI.address, bob.address, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, with ETH fee', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            router.address,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [router.address, amountOut])
          planner.addCommand(CommandType.PAY_PORTION, [ETH_ADDRESS, bob.address, 50])
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
            0,
            minAmountOut,
            [WETH.address, DAI.address],
            bob.address,
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

          planner.addCommand(CommandType.WRAP_ETH, [router.address, value])
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(1),
            [WETH.address, DAI.address],
            bob.address,
            SOURCE_ROUTER,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, CONTRACT_BALANCE])

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
          recipient: bob.address,
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
          recipient: bob.address,
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
          recipient: bob.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOut, {
          slippageTolerance,
          recipient: bob.address,
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
          recipient: bob.address,
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
          recipient: bob.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(approveAndExecuteSwapRouter02({ value: '0', calldata }, DAI, WETH, bob))
      })
    })

    describe('with Narwhal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(500)
      const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
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
            recipient ?? bob.address,
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
        await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
        await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
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
          addV3ExactInTrades(planner, 1, amountOutMin, bob.address, [DAI.address, WETH.address, USDC.address])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn, one trade, three hops', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, bob.address, [
            DAI.address,
            WETH.address,
            USDT.address,
            USDC.address,
          ])
          const { commands, inputs } = planner

          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut, one trade, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
            bob.address,
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
            bob.address,
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
            bob.address,
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
        it('gas: exactIn swap', async () => {
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin, router.address)
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, CONTRACT_BALANCE])

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
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, amountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, amountIn])
          addV3ExactInTrades(planner, 1, amountOutMin, bob.address, tokens, SOURCE_ROUTER)

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, amountInMax])
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [bob.address, amountOut, amountInMax, path, SOURCE_ROUTER])
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, CONTRACT_BALANCE])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountInMax })
          )
        })
      })
    })
  })

  describe('Mixing V2 and V3', () => {
    describe('with Narwhal Router.', () => {
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
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            0,
            v2AmountOutMin,
            v2Tokens,
            bob.address,
            SOURCE_MSG_SENDER,
          ])

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
            v2AmountIn,
            v2AmountOutMin,
            v2Tokens,
            router.address,
            SOURCE_MSG_SENDER,
          ])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            bob.address,
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
        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with batch permit', async () => {
          const route1 = [DAI.address, USDC.address, WETH.address]
          const route2 = [DAI.address, USDT.address, WETH.address]
          const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
          const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
          const minAmountOut1 = expandTo18DecimalsBN(0.005)
          const minAmountOut2 = expandTo18DecimalsBN(0.0075)

          const transferDetail1: TransferDetail = {
            token: DAI.address,
            amount: v2AmountIn1,
            to: Pair.getAddress(DAI, USDC),
          }

          const transferDetail2: TransferDetail = {
            token: DAI.address,
            amount: v2AmountIn2,
            to: Pair.getAddress(DAI, USDT),
          }

          const calldata = await constructBatchTransferFromCalldata([transferDetail1, transferDetail2])

          // 1) transfer funds into DAI-USDC and DAI-USDT pairs to trade
          planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [calldata])
          // 2) trade route1 and return tokens to bob
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [0, minAmountOut1, route1, bob.address, SOURCE_MSG_SENDER])
          // 3) trade route2 and return tokens to bob
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [0, minAmountOut2, route2, bob.address, SOURCE_MSG_SENDER])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ERC20 --> ERC20 split V2 and V2 different routes, each two hop, without batch permit', async () => {
          // this test is the same as the above test, but isntead of a batch permit, separate permits within the 2 trades
          const route1 = [DAI.address, USDC.address, WETH.address]
          const route2 = [DAI.address, USDT.address, WETH.address]
          const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
          const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
          const minAmountOut1 = expandTo18DecimalsBN(0.005)
          const minAmountOut2 = expandTo18DecimalsBN(0.0075)

          // 2) trade route1 and return tokens to bob
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            v2AmountIn1,
            minAmountOut1,
            route1,
            bob.address,
            SOURCE_MSG_SENDER,
          ])
          // 3) trade route2 and return tokens to bob
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            v2AmountIn2,
            minAmountOut2,
            route2,
            bob.address,
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
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountIn, 0, tokens, router.address, SOURCE_MSG_SENDER])
          // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [WETH.address, bob.address, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ETH --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [WETH.address, USDC.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
          const value = v2AmountIn.add(v3AmountIn)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, value])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountIn, 0, tokens, router.address, SOURCE_ROUTER])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_ROUTER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [USDC.address, bob.address, 0.0005 * 10 ** 6])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })

        it('gas: ERC20 --> ETH split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(20)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(30)

          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountIn, 0, tokens, router.address, SOURCE_MSG_SENDER])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
            SOURCE_MSG_SENDER,
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, expandTo18DecimalsBN(0.0005)])

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
            v2AmountOut,
            maxAmountIn,
            [DAI.address, WETH.address],
            router.address,
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
          planner.addCommand(CommandType.UNWRAP_WETH, [bob.address, fullAmountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })
    })
  })
})
