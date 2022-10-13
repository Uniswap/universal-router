import type { Contract } from '@ethersproject/contracts'
import { parseEvents, V2_EVENTS } from './shared/parseEvents'
import {
  RouterPlanner,
  SweepCommand,
  TransferCommand,
  V2ExactInputCommand,
  V2ExactOutputCommand,
  V3ExactInputCommand,
  V3ExactOutputCommand,
  UnwrapWETHCommand,
  UnwrapWETHWithFeeCommand,
  SweepWithFeeCommand,
  WrapETHCommand,
} from '@uniswap/narwhal-sdk'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { Route as V2RouteSDK, Pair } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK, FeeAmount } from '@uniswap/v3-sdk'
import { SwapRouter, MixedRouteSDK, Trade } from '@uniswap/router-sdk'
import { expect } from './shared/expect'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  makePair,
  expandTo18Decimals,
  encodePath,
  pool_DAI_WETH,
  pool_DAI_USDC,
  pool_USDC_WETH,
  pool_USDC_USDT,
  pool_WETH_USDT,
} from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { Router } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, resetFork, WETH, DAI, USDC, USDT } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import { expandTo18DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

function encodePathExactOutput(tokens: string[]) {
  return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

describe('Uniswap V2 and V3 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RouterPlanner

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
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const routerFactory = await ethers.getContractFactory('Router')
    router = (
      await routerFactory.deploy(
        ethers.constants.AddressZero,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
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

      it('gas: exactIn, one trade, one hop', async () => {
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

      it('gas: exactIn, one trade, two hops', async () => {
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

      it('gas: exactIn ETH, one trade, one hop', async () => {
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

      it('gas: exactOut, one trade, one hop', async () => {
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

      it('gas: exactOut ETH, one trade, one hop', async () => {
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
      let planner: RouterPlanner

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
        await wethContract.connect(alice).approve(router.address, expandTo18DecimalsBN(5000))
      })

      it('completes a V2 exactIn swap', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))

        const { commands, state } = planner.plan()

        const balanceBefore = await wethContract.balanceOf(alice.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)).wait()
        const balanceAfter = await wethContract.balanceOf(alice.address)
        const amountOut = parseEvents(V2_EVENTS, receipt).reduce(
          (prev, current) => prev.add(current!.args.amount1Out),
          expandTo18DecimalsBN(0)
        )
        expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
      })

      it('completes a V2 exactIn swap ETH', async () => {
        const pairAddress = Pair.getAddress(DAI, WETH)
        planner.add(WrapETHCommand(pairAddress, amountIn))
        planner.add(V2ExactInputCommand(amountIn, [WETH.address, DAI.address], alice.address))

        const { commands, state } = planner.plan()

        const daiBalanceBefore = await daiContract.balanceOf(alice.address)
        const ethBalanceBefore = await ethers.provider.getBalance(alice.address)

        const receipt = await (
          await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: amountIn.toString() })
        ).wait()

        const daiBalanceAfter = await daiContract.balanceOf(alice.address)
        const ethBalanceAfter = await ethers.provider.getBalance(alice.address)
        const amountOut = parseEvents(V2_EVENTS, receipt).reduce(
          (prev, current) => prev.add(current!.args.amount0Out),
          expandTo18DecimalsBN(0)
        )
        const daiDelta = daiBalanceAfter.sub(daiBalanceBefore)
        const ethDelta = ethBalanceAfter.sub(ethBalanceBefore)
        const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        expect(daiDelta).to.be.gt(0)
        expect(daiDelta).to.equal(amountOut)
        expect(ethDelta).to.be.lt(0)
        expect(ethDelta.mul(-1)).to.eq(amountIn.add(gasSpent))
      })

      it('completes a V2 exactOut swap', async () => {
        // this will eventually be permit post
        const amountOut = expandTo18DecimalsBN(1)
        planner.add(
          V2ExactOutputCommand(amountOut, expandTo18DecimalsBN(10000), [WETH.address, DAI.address], alice.address)
        )
        planner.add(SweepCommand(WETH.address, alice.address, 0))
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceDaiBefore = await daiContract.balanceOf(alice.address)
        await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100)) // TODO: permitPost
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)).wait()
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceDaiAfter = await daiContract.balanceOf(alice.address)

        const totalAmountIn = parseEvents(V2_EVENTS, receipt)
          .reduce((prev, current) => prev.add(current!.args.amount1In), expandTo18DecimalsBN(0))
          .mul(-1) // totalAmountIn will be negative

        // TODO: when permitpost is ready, test this number against alice's EOA
        expect(balanceWethAfter.sub(balanceWethBefore)).to.equal(totalAmountIn)
        expect(balanceDaiBefore.sub(balanceDaiAfter)).to.be.lte(amountOut)
      })

      it('completes a V2 exactOut swap ETH', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.add(
          V2ExactOutputCommand(amountOut, expandTo18DecimalsBN(10000), [DAI.address, WETH.address], router.address)
        )
        planner.add(UnwrapWETHCommand(alice.address, CONTRACT_BALANCE))

        const { commands, state } = planner.plan()
        const ethBalanceBefore = await ethers.provider.getBalance(alice.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)).wait()

        const ethBalanceAfter = await ethers.provider.getBalance(alice.address)
        const ethDelta = ethBalanceAfter.sub(ethBalanceBefore)
        const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        expect(ethDelta).to.eq(amountOut.sub(gasSpent))
      })

      it('completes a V2 exactOut swap ETH, with ETH fee', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.add(
          V2ExactOutputCommand(amountOut, expandTo18DecimalsBN(10000), [DAI.address, WETH.address], router.address)
        )
        const ONE_PERCENT = 100
        planner.add(UnwrapWETHWithFeeCommand(alice.address, CONTRACT_BALANCE, ONE_PERCENT, bob.address))

        const { commands, state } = planner.plan()
        const ethBalanceBeforeAlice = await ethers.provider.getBalance(alice.address)
        const ethBalanceBeforeBob = await ethers.provider.getBalance(bob.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)).wait()

        const ethBalanceAfterAlice = await ethers.provider.getBalance(alice.address)
        const ethBalanceAfterBob = await ethers.provider.getBalance(bob.address)
        const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        const bobFee = ethBalanceAfterBob.sub(ethBalanceBeforeBob)
        const aliceEarnings = ethBalanceAfterAlice.sub(ethBalanceBeforeAlice).add(gasSpent)

        expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT).div(10000)).to.eq(bobFee)
      })

      it('exactIn trade, where an output fee is taken', async () => {
        // will likely make the most sense to take fees on input with permit post in most situations
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))

        // back to the router so someone can take a fee
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], router.address))

        const ONE_PERCENT = 100
        planner.add(SweepWithFeeCommand(WETH.address, alice.address, 1, ONE_PERCENT, bob.address))

        const { commands, state } = planner.plan()
        const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceBeforeBob = await wethContract.balanceOf(bob.address)

        await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)

        const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceAfterBob = await wethContract.balanceOf(bob.address)

        const bobFee = wethBalanceAfterBob.sub(wethBalanceBeforeBob)
        const aliceEarnings = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)

        expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT).div(10000)).to.eq(bobFee)
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address, USDC.address], alice.address))
        const { commands, state } = planner.plan()

        const balanceBefore = await usdcContract.balanceOf(alice.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)).wait()
        const balanceAfter = await usdcContract.balanceOf(alice.address)
        const events = parseEvents(V2_EVENTS, receipt)
        const amountOut = events[events.length - 1]!.args.amount0Out
        expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
      })

      it('gas: exactIn, one trade, one hop', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactIn, one trade, one hop, no deadline', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[])'](commands, state))
      })

      it('gas: exactIn, one trade, two hops', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, USDC.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactIn, one trade, three hops', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, USDC.address, USDT.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactIn, one trade, three hops, no deadline', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, USDC.address, USDT.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[])'](commands, state))
      })

      it('gas: exactIn ETH, one trade, one hop', async () => {
        const pairAddress = Pair.getAddress(DAI, WETH)
        planner.add(WrapETHCommand(pairAddress, amountIn))
        planner.add(V2ExactInputCommand(amountIn, [WETH.address, DAI.address], alice.address))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: amountIn }))
      })

      it('gas: exactOut, one trade, one hop', async () => {
        await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100))
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut, one trade, two hops', async () => {
        await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100))
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDC.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut, one trade, three hops', async () => {
        await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100))
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDT.address, USDC.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut ETH, one trade, one hop', async () => {
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(1),
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            router.address
          )
        )
        planner.add(UnwrapWETHCommand(alice.address, CONTRACT_BALANCE))
        planner.add(SweepCommand(DAI.address, alice.address, 0)) //exactOut will have to sweep tokens w/ PermitPost

        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
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

      it('gas: exactIn, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactIn, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: exactIn, one trade, two hops', async () => {
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

      it('gas: exactIn, one trade, three hops', async () => {
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

      it('gas: exactOut, one trade, one hop', async () => {
        const { calldata } = SwapRouter.swapCallParameters(v3ExactOut, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: exactOut, one trade, two hops', async () => {
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

      it('gas: exactOut, one trade, three hops', async () => {
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
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
      const amountOut: BigNumber = expandTo18DecimalsBN(1)

      const addV3ExactInTrades = (
        planner: RouterPlanner,
        numTrades: number,
        amountOutMin: number,
        tokens: string[] = [DAI.address, WETH.address]
      ) => {
        const path = encodePathExactInput(tokens)
        for (let i = 0; i < numTrades; i++) {
          planner.add(V3ExactInputCommand(alice.address, amountIn, amountOutMin, path))
        }
      }

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(router.address, expandTo18DecimalsBN(1000000))
      })

      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceUsdcBefore = await usdcContract.balanceOf(alice.address)

        await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)

        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceUsdcAfter = await usdcContract.balanceOf(alice.address)

        expect(balanceWethAfter).to.eq(balanceWethBefore)
        expect(balanceUsdcAfter.sub(balanceUsdcBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactOut swap', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })

      it('completes a V3 exactOut swap with longer path', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, USDC.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })

      it('gas: exactIn, one trade, one hop', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactIn, one trade, two hops', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactIn, one trade, three hops', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDT.address, USDC.address])
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut, one trade, one hop', async () => {
        const tokens = [DAI.address, WETH.address]
        const path = encodePathExactOutput(tokens)
        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut, one trade, two hops', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, USDC.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: exactOut, one trade, three hops', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, USDC.address, USDT.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })
    })
  })

  describe('Mixing V2 and V3', () => {
    describe('with Router02.', () => {
      let amountIn: CurrencyAmount<Token>
      let mixedRoute: MixedRouteSDK<Token, Token>
      let mixedTradeExactIn: Trade<Token, Token, TradeType.EXACT_INPUT>

      const slippageTolerance = new Percent(10, 100)
      const recipient = '0x0000000000000000000000000000000000000003'

      it('gas: V3, then V2', async () => {
        amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))

        // trades a v3 pool then a v2 pair
        mixedRoute = new MixedRouteSDK([pool_DAI_USDC, pair_USDC_WETH], DAI, WETH)
        mixedTradeExactIn = await Trade.fromRoute(mixedRoute, amountIn, TradeType.EXACT_INPUT)

        const { calldata } = SwapRouter.swapCallParameters(mixedTradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })

      it('gas: V2, then V3', async () => {
        amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))

        // trades a v2 pair, then a v3 pool
        mixedRoute = new MixedRouteSDK([pair_DAI_USDC, pool_USDC_WETH], DAI, WETH)
        mixedTradeExactIn = await Trade.fromRoute(mixedRoute, amountIn, TradeType.EXACT_INPUT)

        const { calldata } = SwapRouter.swapCallParameters(mixedTradeExactIn, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(executeSwap({ value: '0', calldata }, DAI, WETH, alice))
      })
    })

    describe('with Narwhal Router.', () => {
      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(router.address, expandTo18DecimalsBN(1000000))
      })

      it('gas: V3, then V2', async () => {
        const v3Tokens = [DAI.address, USDC.address]
        const v2Tokens = [USDC.address, WETH.address]
        const v3AmountIn: BigNumber = expandTo18DecimalsBN(5)
        const v3AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
        const v2AmountOutMin = 0.0005 * 10 ** 18
        // V3 trades DAI for USDC, recipient of first trade is the v2 pool for second trade
        planner.add(
          V3ExactInputCommand(Pair.getAddress(USDC, WETH), v3AmountIn, v3AmountOutMin, encodePathExactInput(v3Tokens))
        )
        // V2 trades USDC for WETH, sending the tokens to Alice again
        planner.add(V2ExactInputCommand(v2AmountOutMin, v2Tokens, alice.address))

        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: V2, then V3', async () => {
        const v2Tokens = [DAI.address, USDC.address]
        const v3Tokens = [USDC.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
        const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
        const v3AmountOutMin = 0.0005 * 10 ** 18
        planner.add(TransferCommand(DAI.address, Pair.getAddress(DAI, USDC), v2AmountIn))
        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        planner.add(V2ExactInputCommand(v2AmountOutMin, v2Tokens, router.address))
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        planner.add(
          V3ExactInputCommand(alice.address, CONTRACT_BALANCE, v3AmountOutMin, encodePathExactInput(v3Tokens))
        )

        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })

      it('gas: split V2 and V3, one hop', async () => {
        const tokens = [DAI.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
        const v2AmountOutMin = 0.0002 * 10 ** 18
        const v3AmountOutMin = 0.0003 * 10 ** 18
        planner.add(TransferCommand(DAI.address, Pair.getAddress(DAI, WETH), v2AmountIn))
        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        planner.add(V2ExactInputCommand(v2AmountOutMin, tokens, alice.address))
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        planner.add(V3ExactInputCommand(alice.address, CONTRACT_BALANCE, v3AmountOutMin, encodePathExactInput(tokens)))

        const { commands, state } = planner.plan()
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE))
      })
    })
  })
})
