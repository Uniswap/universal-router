import type { Contract } from '@ethersproject/contracts'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { Route as V2RouteSDK, Pair } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK, FeeAmount } from '@uniswap/v3-sdk'
import { SwapRouter, Trade } from '@uniswap/router-sdk'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployRouter from './../shared/deployRouter'
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
import { Router } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, resetFork, WETH, DAI, USDC } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, CONTRACT_BALANCE, DEADLINE } from '../shared/constants'
import { expandTo18DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { RoutePlanner, CommandType } from '../shared/planner'
const { ethers } = hre

const ONE_PERCENT = 100

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
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
    router = (await deployRouter()).connect(alice) as Router
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    pair_DAI_USDC = await makePair(alice, DAI, USDC)
    pair_USDC_WETH = await makePair(alice, USDC, WETH)
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

      it('gas: exactIn, one trade, one hop ERC20 --> ERC20', async () => {
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

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
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

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
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

        await snapshotGasCost(executeSwap({ value, calldata }, DAI, WETH, alice))
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

        await snapshotGasCost(executeSwap({ value: '0', calldata }, WETH, DAI, alice))
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

        await snapshotGasCost(executeSwap({ value, calldata }, DAI, WETH, alice))
      })
    })

    describe('with Narwhal Router.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      let planner: RoutePlanner

      beforeEach(async () => {
        planner = new RoutePlanner()
        await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
        await wethContract.approve(router.address, expandTo18DecimalsBN(5000))
      })

      describe('ERC20 --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(10000),
            [WETH.address, DAI.address],
            alice.address,
          ])
          planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, 0])
          await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100)) // TODO: permitPost
          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn trade, where an output fee is taken', async () => {
          // will likely make the most sense to take fees on input with permit post in most situations
          planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
          // back to the router so someone can take a fee
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], router.address])
          planner.addCommand(CommandType.SWEEP_WITH_FEE, [WETH.address, alice.address, 1, ONE_PERCENT, bob.address])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap with longer path', async () => {
          const minAmountOut = expandTo18DecimalsBN(0.0001)
          planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
            minAmountOut,
            [DAI.address, USDC.address, WETH.address],
            alice.address,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn swap', async () => {
          planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], router.address])
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            router.address,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, amountOut])
          planner.addCommand(CommandType.SWEEP, [DAI.address, alice.address, 0])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap, with ETH fee', async () => {
          const amountOut = expandTo18DecimalsBN(1)
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            router.address,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH_WITH_FEE, [
            alice.address,
            CONTRACT_BALANCE,
            ONE_PERCENT,
            bob.address,
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const minAmountOut = expandTo18DecimalsBN(0.001)
          const pairAddress = Pair.getAddress(DAI, WETH)
          planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [minAmountOut, [WETH.address, DAI.address], alice.address])

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut swap', async () => {
          const amountOut = expandTo18DecimalsBN(100)
          const value = expandTo18DecimalsBN(1)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, value])
          planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
            amountOut,
            expandTo18DecimalsBN(1),
            [WETH.address, DAI.address],
            alice.address,
          ])
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

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

      it('gas: exactIn, one trade, one hop ERC20 --> ERC20', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactIn, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, two hops', async () => {
        v3ExactInMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactInMultihop, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: ERC20 --> ERC20 exactIn, one trade, three hops', async () => {
        v3ExactInMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_USDT, pool_WETH_USDT], DAI, WETH),
          amountIn,
          TradeType.EXACT_INPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactInMultihop, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOut, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, two hops', async () => {
        v3ExactOutMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOutMultihop, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: ERC20 --> ERC20 exactOut, one trade, three hops', async () => {
        v3ExactOutMultihop = await Trade.fromRoute(
          new V3RouteSDK([pool_DAI_USDC, pool_USDC_USDT, pool_WETH_USDT], DAI, WETH),
          amountOut,
          TradeType.EXACT_OUTPUT
        )
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOutMultihop, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
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
        tokens: string[] = [DAI.address, WETH.address]
      ) => {
        const path = encodePathExactInput(tokens)
        for (let i = 0; i < numTrades; i++) {
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [recipient ?? alice.address, amountIn, amountOutMin, path])
        }
      }

      beforeEach(async () => {
        planner = new RoutePlanner()
        await daiContract.transfer(router.address, expandTo18DecimalsBN(1000000))
      })

      describe('ERC20 --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin)

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactIn swap with longer path', async () => {
          const amountOutMin: number = 3 * 10 ** 6
          addV3ExactInTrades(planner, 1, amountOutMin, alice.address, [DAI.address, WETH.address, USDC.address])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, WETH.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap with longer path', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, USDC.address, WETH.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ERC20 --> ETH', () => {
        it('gas: exactIn swap', async () => {
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
          addV3ExactInTrades(planner, 1, amountOutMin, router.address)
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: exactOut swap', async () => {
          // trade DAI in for WETH out
          const tokens = [DAI.address, WETH.address]
          const path = encodePathExactOutput(tokens)
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [router.address, amountOut, amountInMax, path])
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, amountOut])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('ETH --> ERC20', () => {
        it('gas: exactIn swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, amountIn])
          addV3ExactInTrades(planner, 1, amountOutMin, alice.address, tokens)

          const { commands, inputs } = planner
          await snapshotGasCost(
            router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn })
          )
        })

        it('gas: exactOut swap', async () => {
          const tokens = [WETH.address, DAI.address]
          const path = encodePathExactOutput(tokens)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, amountInMax])
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

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
        await daiContract.transfer(router.address, expandTo18DecimalsBN(1000))
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
          ])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountOutMin, v2Tokens, alice.address])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: V2, then V3', async () => {
          const v2Tokens = [DAI.address, USDC.address]
          const v3Tokens = [USDC.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
          const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
          const v3AmountOutMin = expandTo18DecimalsBN(0.0005)

          planner.addCommand(CommandType.TRANSFER, [DAI.address, Pair.getAddress(DAI, USDC), v2AmountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountOutMin, v2Tokens, router.address])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            alice.address,
            CONTRACT_BALANCE,
            v3AmountOutMin,
            encodePathExactInput(v3Tokens),
          ])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })

      describe('Split routes', () => {
        it('gas: ERC20 --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)

          planner.addCommand(CommandType.TRANSFER, [DAI.address, Pair.getAddress(DAI, WETH), v2AmountIn])
          // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [0, tokens, router.address])
          // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })

        it('gas: ETH --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [WETH.address, USDC.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
          const value = v2AmountIn.add(v3AmountIn)

          planner.addCommand(CommandType.WRAP_ETH, [router.address, value])
          planner.addCommand(CommandType.TRANSFER, [WETH.address, Pair.getAddress(USDC, WETH), v2AmountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [0, tokens, router.address])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.SWEEP, [USDC.address, alice.address, 0.0005 * 10 ** 6])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
        })

        it('gas: ERC20 --> ETH split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(20)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(30)

          planner.addCommand(CommandType.TRANSFER, [DAI.address, Pair.getAddress(DAI, WETH), v2AmountIn])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [0, tokens, router.address])
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            router.address,
            v3AmountIn,
            0,
            encodePathExactInput(tokens),
          ])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, expandTo18DecimalsBN(0.0005)])

          const { commands, inputs } = planner
          await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        })
      })
    })
  })
})
