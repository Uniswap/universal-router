import { Interface, LogDescription } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import type { Contract } from '@ethersproject/contracts'
import { RouterPlanner, TransferCommand, V2ExactInputCommand, V2ExactOutputCommand } from '@uniswap/narwhal-sdk'
import { BigintIsh, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { Route as V2Route, Trade as V2Trade } from '@uniswap/v2-sdk'
import JSBI from 'jsbi'
import { SwapRouter } from '@uniswap/router-sdk'
import { expect } from './shared/expect'
import { pair_DAI_WETH } from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { MAX_UINT } from './shared/constants'

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

function expandTo18Decimals(n: number): BigintIsh {
  return JSBI.BigInt(BigNumber.from(n).mul(BigNumber.from(10).pow(18)).toString())
}

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

describe('WeirollRouter', () => {
  const slippageTolerance = new Percent(50, 100)
  const recipient = '0x0000000000000000000000000000000000000003'
  const deadline = 2000000000

  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0xf977814e90da44bfa03b6295a0616a897441acec'],
    })
    alice = await ethers.getSigner('0xf977814e90da44bfa03b6295a0616a897441acec')
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)) as WeirollRouter
  })

  it('bytecode size', async () => {
    expect(((await weirollRouter.provider.getCode(weirollRouter.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('#trade uniswap v2', () => {
    describe('with Router02', () => {
      const amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      const v2Trade = V2Trade.exactIn(new V2Route([pair_DAI_WETH], DAI, WETH), amountIn)

      afterEach(async () => {
        await resetFork()
      })

      it('gas: one trade, one hop, exactIn', async () => {
        const trades = [v2Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const trades = [v2Trade, v2Trade, v2Trade, v2Trade, v2Trade, v2Trade]
        const { calldata } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        const receipt = await executeSwap({ value: '0', calldata }, DAI, WETH, alice)
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })

    describe('with Weiroll', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      const addV2ExactInTrades = (planner: RouterPlanner, numTrades: number) => {
        for (let i = 0; i < numTrades; i++) {
          // transfer input tokens into the pair to trade
          planner.add(
            new TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn)
          )
          planner.add(new V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
        }
      }

      const addV2ExactOutTrades = (planner: RouterPlanner, numTrades: number, amountOut: BigNumber) => {
        for (let i = 0; i < numTrades; i++) {
          planner.add(new V2ExactOutputCommand(amountOut, expandTo18DecimalsBN(10000), [DAI.address, WETH.address], alice.address))
        }
      }

      const addV2ExactInMultiHop = (planner: RouterPlanner) => {
        // transfer input tokens into the pair to trade
        planner.add(
          new TransferCommand(DAI.address, weirollRouter.address, pair_DAI_WETH.liquidityToken.address, amountIn)
        )
        planner.add(new V2ExactInputCommand(1, [DAI.address, WETH.address, USDC.address], alice.address))
      }

      let planner: RouterPlanner

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(55))
      })

      afterEach(async () => {
        await resetFork()
      })

      it('completes a V2 exactIn swap', async () => {
        addV2ExactInTrades(planner, 1)
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
        await daiContract.connect(alice).approve(weirollRouter.address, MAX_UINT)

        const amountOut = expandTo18DecimalsBN(1)
        addV2ExactOutTrades(planner, 1, amountOut)
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceDaiBefore = await daiContract.balanceOf(alice.address)
        await weirollRouter.connect(alice).execute(commands, state)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceDaiAfter = await daiContract.balanceOf(alice.address)

        expect(balanceWethAfter.sub(balanceWethBefore)).to.equal(amountOut)
        expect(balanceDaiBefore.sub(balanceDaiAfter)).to.be.lte(expandTo18DecimalsBN(10000))
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        addV2ExactInMultiHop(planner)
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
        addV2ExactInTrades(planner, 1)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        addV2ExactInTrades(planner, 6)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })
  })
})
