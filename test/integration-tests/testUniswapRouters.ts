import { Interface, LogDescription } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import type { Contract } from '@ethersproject/contracts'
import {
  RouterPlanner,
  TransferCommand,
  V2ExactInputCommand,
  V2ExactOutputCommand,
  V3ExactInputCommand,
} from '@uniswap/narwhal-sdk'
import { CurrencyAmount, Percent, Token } from '@uniswap/sdk-core'
import { Route as V2Route, Trade as V2Trade, Pair } from '@uniswap/v2-sdk'
import { FeeAmount, Route as V3Route, Trade as V3Trade } from '@uniswap/v3-sdk'
import { SwapRouter } from '@uniswap/router-sdk'
import { expect } from './shared/expect'
import { makePair, expandTo18Decimals, encodePath, pool_DAI_WETH } from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS } from './shared/constants'
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
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)) as WeirollRouter
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
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(55))
        await wethContract.transfer(weirollRouter.address, expandTo18DecimalsBN(55))
      })

      afterEach(async () => {
        await resetFork()
      })

      it('completes a V2 exactIn swap', async () => {
        planner.add(TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn))
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

      it('completes a V2 exactOut swap', async () => {
        // this will eventually be permit post
        const amountOut = expandTo18DecimalsBN(1)
        planner.add(
          V2ExactOutputCommand(amountOut, expandTo18DecimalsBN(10000), [WETH.address, DAI.address], alice.address)
        )
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(weirollRouter.address)
        const balanceDaiBefore = await daiContract.balanceOf(alice.address)
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        const balanceWethAfter = await wethContract.balanceOf(weirollRouter.address)
        const balanceDaiAfter = await daiContract.balanceOf(alice.address)

        const totalAmountIn = parseEvents(V2_EVENTS, receipt)
          .reduce((prev, current) => prev.add(current!.args.amount1In), expandTo18DecimalsBN(0))
          .mul(-1) // totalAmountIn will be negative

        // TODO: when permitpost is ready, test this number against alice's EOA
        expect(balanceWethAfter.sub(balanceWethBefore)).to.equal(totalAmountIn)
        expect(balanceDaiBefore.sub(balanceDaiAfter)).to.be.lte(amountOut)
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        planner.add(TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn))
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
        planner.add(TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, two hops, exactIn', async () => {
        planner.add(TransferCommand(DAI.address, weirollRouter.address, pair_DAI_USDC.liquidityToken.address, amountIn))
        planner.add(V2ExactInputCommand(1, [DAI.address, USDC.address, WETH.address], alice.address))
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: one trade, one hop, exactOut', async () => {
        planner.add(
          V2ExactOutputCommand(
            expandTo18DecimalsBN(5),
            expandTo18DecimalsBN(10000),
            [WETH.address, DAI.address],
            alice.address
          )
        )
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        for (let i = 0; i < 6; i++) {
          // transfer input tokens into the pair to trade
          planner.add(
            TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn)
          )
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
      const v3TradePromise = V3Trade.exactIn(new V3Route([pool_DAI_WETH], DAI, WETH), amountIn)
      const slippageTolerance = new Percent(50, 100)

      it('gas: one trade, one hop, exactIn', async () => {
        const v3Trade = await v3TradePromise
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
        const v3Trade = await v3TradePromise
        const trades = [v3Trade, v3Trade, v3Trade, v3Trade, v3Trade, v3Trade]
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

      const addV3ExactInTrades = (
        planner: RouterPlanner,
        numTrades: number,
        amountOutMin: number,
        tokens: string[] = [DAI.address, WETH.address]
      ) => {
        const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
        for (let i = 0; i < numTrades; i++) {
          planner.add(V3ExactInputCommand(alice.address, amountIn, amountOutMin, path))
        }
      }

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(10000))
      })

      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await weirollRouter.connect(alice).execute(commands, state)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceUsdcBefore = await usdcContract.balanceOf(alice.address)

        await weirollRouter.connect(alice).execute(commands, state)

        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceUsdcAfter = await usdcContract.balanceOf(alice.address)

        expect(balanceWethAfter).to.eq(balanceWethBefore)
        expect(balanceUsdcAfter.sub(balanceUsdcBefore)).to.be.gte(amountOutMin)
      })

      it('gas: one trade, one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10 ** 18
        addV3ExactInTrades(planner, 6, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })
  })
})
