import { Interface, LogDescription } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import type { Contract } from '@ethersproject/contracts'
import {
  RouterPlanner,
  SweepCommand,
  TransferCommand,
  V2ExactInputCommand,
  V2ExactOutputCommand,
  V3ExactInputCommand,
  V3ExactOutputCommand,
  UnwrapWETHCommand,
  WrapETHCommand,
} from '@uniswap/narwhal-sdk'
import { CurrencyAmount, Ether, Percent, Token } from '@uniswap/sdk-core'
import { Route as V2Route, Trade as V2Trade, Pair } from '@uniswap/v2-sdk'
import { FeeAmount, Route as V3Route, Trade as V3Trade } from '@uniswap/v3-sdk'
import { SwapRouter } from '@uniswap/router-sdk'
import { expect } from './shared/expect'
import {
  makePair,
  expandTo18Decimals,
  encodePath,
  pool_DAI_WETH,
  pool_DAI_USDC,
  pool_USDC_WETH,
} from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, CONTRACT_BALANCE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

function expandTo18DecimalsBN(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

function parseEvents(iface: Interface, receipt: TransactionReceipt): (LogDescription | undefined)[] {
  return receipt.logs
    .map((log: { topics: Array<string>; data: string }) => {
      try {
        return iface.parseLog(log)
      } catch (e) {
        return undefined
      }
    })
    .filter((n: LogDescription | undefined) => n)
}

function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

function encodePathExactOutput(tokens: string[]) {
  return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

async function resetFork() {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          blockNumber: 15360000,
        },
      },
    ],
  })
}

const V2_EVENTS = new Interface([
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
])

describe('Uniswap V2 and V3 Tests:', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RouterPlanner
  let pair_DAI_WETH: Pair
  let pair_DAI_USDC: Pair
  let pair_USDC_WETH: Pair

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    pair_DAI_USDC = await makePair(alice, DAI, USDC)
    pair_USDC_WETH = await makePair(alice, USDC, WETH)
  })

  afterEach(async () => {
    await resetFork()
  })

  it('bytecode size', async () => {
    expect(((await weirollRouter.provider.getCode(weirollRouter.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('Trade on UniswapV2', () => {
    describe('with Router02.', () => {
      const slippageTolerance = new Percent(50, 100)
      const recipient = '0x0000000000000000000000000000000000000003'
      const deadline = 2000000000

      let amountIn: CurrencyAmount<Token>
      let amountOut: CurrencyAmount<Token>
      let v2TradeExactIn: any
      let v2TradeExactOut: any

      beforeEach(async () => {
        amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
        amountOut = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
        v2TradeExactIn = V2Trade.exactIn(new V2Route([pair_DAI_WETH], DAI, WETH), amountIn)
        v2TradeExactOut = V2Trade.exactOut(new V2Route([pair_DAI_WETH], WETH, DAI), amountOut)
      })

      afterEach(async () => {
        await resetFork()
      })

      it('gas: one trade, one hop, exactIn', async () => {
        const trades = [v2TradeExactIn]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactIn', async () => {
        const trades = [V2Trade.exactIn(new V2Route([pair_DAI_USDC, pair_USDC_WETH], DAI, WETH), amountIn)]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactIn ETH', async () => {
        const amountInETH = CurrencyAmount.fromRawAmount(Ether.onChain(1), expandTo18Decimals(5))
        const trades = [V2Trade.exactIn(new V2Route([pair_DAI_WETH], Ether.onChain(1), DAI), amountInETH)]
        const { calldata, value } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value, calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut', async () => {
        const trades = [v2TradeExactOut]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, WETH, DAI, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut ETH', async () => {
        const amountOutETH = CurrencyAmount.fromRawAmount(Ether.onChain(1), expandTo18Decimals(5))
        const trades = [V2Trade.exactOut(new V2Route([pair_DAI_WETH], DAI, Ether.onChain(1)), amountOutETH)]
        const { calldata, value } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value, calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const trades = [v2TradeExactIn, v2TradeExactIn, v2TradeExactIn, v2TradeExactIn, v2TradeExactIn, v2TradeExactIn]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })

    describe('with Weiroll.', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      let planner: RouterPlanner

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(5000))
        await wethContract.connect(alice).approve(weirollRouter.address, expandTo18DecimalsBN(5000))
      })

      afterEach(async () => {
        await resetFork()
      })

      it('completes a V2 exactIn swap', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))

        const { commands, state } = planner.plan()

        const balanceBefore = await wethContract.balanceOf(alice.address)
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
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

        const receipt = await (await weirollRouter.execute(commands, state, { value: amountIn.toString() })).wait()

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
        await wethContract.connect(alice).transfer(weirollRouter.address, expandTo18DecimalsBN(100)) // TODO: permitPost
        const receipt = await (await weirollRouter.execute(commands, state)).wait()
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
          V2ExactOutputCommand(
            amountOut,
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            weirollRouter.address
          )
        )
        planner.add(UnwrapWETHCommand(alice.address, CONTRACT_BALANCE))

        const { commands, state } = planner.plan()
        const ethBalanceBefore = await ethers.provider.getBalance(alice.address)
        const receipt = await (await weirollRouter.execute(commands, state)).wait()

        const ethBalanceAfter = await ethers.provider.getBalance(alice.address)
        const ethDelta = ethBalanceAfter.sub(ethBalanceBefore)
        const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        expect(ethDelta).to.eq(amountOut.sub(gasSpent))
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address, USDC.address], alice.address))
        const { commands, state } = planner.plan()

        const balanceBefore = await usdcContract.balanceOf(alice.address)
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        const balanceAfter = await usdcContract.balanceOf(alice.address)
        const events = parseEvents(V2_EVENTS, receipt)
        const amountOut = events[events.length - 1]!.args.amount0Out
        expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
      })

      it('gas: one trade, one hop, exactIn', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactIn', async () => {
        planner.add(TransferCommand(DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, USDC.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactIn ETH', async () => {
        const pairAddress = Pair.getAddress(DAI, WETH)
        planner.add(WrapETHCommand(pairAddress, amountIn))
        planner.add(V2ExactInputCommand(amountIn, [WETH.address, DAI.address], alice.address))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state, { value: amountIn })
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut', async () => {
        await wethContract.connect(alice).transfer(weirollRouter.address, expandTo18DecimalsBN(100))
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactOut', async () => {
        await wethContract.connect(alice).transfer(weirollRouter.address, expandTo18DecimalsBN(100))
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(100),
            [WETH.address, USDC.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut ETH', async () => {
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(1),
            expandTo18DecimalsBN(10000),
            [DAI.address, WETH.address],
            weirollRouter.address
          )
        )
        planner.add(UnwrapWETHCommand(alice.address, CONTRACT_BALANCE))
        planner.add(SweepCommand(DAI.address, alice.address, 0)) //exactOut will have to sweep tokens w/ PermitPost

        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        for (let i = 0; i < 6; i++) {
          // transfer input tokens into the pair to trade
          planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
          planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        }
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })
  })

  describe('Trade on UniswapV3', () => {
    describe('with Router02.', () => {
      const amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      const amountOut = CurrencyAmount.fromRawAmount(WETH, expandTo18Decimals(1))
      const v3ExactInPromise = V3Trade.exactIn(new V3Route([pool_DAI_WETH], DAI, WETH), amountIn)
      const v3ExactInMultihopPromise = V3Trade.exactIn(
        new V3Route([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
        amountIn
      )
      const v3ExactOutPromise = V3Trade.exactOut(new V3Route([pool_DAI_WETH], DAI, WETH), amountOut)
      const v3ExactOutMultihopPromise = V3Trade.exactOut(
        new V3Route([pool_DAI_USDC, pool_USDC_WETH], DAI, WETH),
        amountOut
      )
      const slippageTolerance = new Percent(50, 100)

      it('gas: one trade, one hop, exactIn', async () => {
        const v3Trade = await v3ExactInPromise
        const trades = [v3Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactIn', async () => {
        const v3Trade = await v3ExactInMultihopPromise
        const trades = [v3Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const v3Trade = await v3ExactInPromise
        const trades = [v3Trade, v3Trade, v3Trade, v3Trade, v3Trade, v3Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut', async () => {
        const v3Trade = await v3ExactOutPromise
        const trades = [v3Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactOut', async () => {
        const v3Trade = await v3ExactOutMultihopPromise
        const trades = [v3Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient: alice.address,
          deadlineOrPreviousBlockhash: 2000000000,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })

    describe('with Weiroll.', () => {
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
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(1000000))
      })

      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await weirollRouter.execute(commands, state)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceUsdcBefore = await usdcContract.balanceOf(alice.address)

        await weirollRouter.execute(commands, state)

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
        await weirollRouter.connect(alice).execute(commands, state)
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
        await weirollRouter.connect(alice).execute(commands, state)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })

      it('gas: one trade, one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactIn', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 6, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut', async () => {
        const tokens = [DAI.address, WETH.address]
        const path = encodePathExactOutput(tokens)
        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactOut', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, USDC.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.add(V3ExactOutputCommand(alice.address, amountOut, amountInMax, path))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })
  })

  describe('Mixing V2 and V3', () => {
    describe('with Router02.', () => {
      it('gas: V3, then V2')
      it('gas: V2, then V3')
      it('gas: split V2 and V3, one hop')
    })
    describe('with Weiroll.', () => {
      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(1000000))
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
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: V2, then V3', async () => {
        const v2Tokens = [DAI.address, USDC.address]
        const v3Tokens = [USDC.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
        const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
        const v3AmountOutMin = 0.0005 * 10 ** 18
        planner.add(TransferCommand(DAI.address, Pair.getAddress(DAI, USDC), v2AmountIn))
        // V2 trades DAI for USDC, sending the tokens back to the router for v3 trade
        planner.add(V2ExactInputCommand(v2AmountOutMin, v2Tokens, weirollRouter.address))
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        planner.add(
          V3ExactInputCommand(alice.address, CONTRACT_BALANCE, v3AmountOutMin, encodePathExactInput(v3Tokens))
        )

        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
      it('gas: split V2 and V3, one hop')
    })
  })
})
