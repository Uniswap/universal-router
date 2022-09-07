import type { Contract } from '@ethersproject/contracts'
import { RouterPlanner, V3ExactInputCommand } from '@uniswap/narwhal-sdk'
import { FeeAmount, Route as V3Route, Trade as V3Trade } from '@uniswap/v3-sdk'
import { SwapRouter } from '@uniswap/router-sdk'
import { CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { expect } from './shared/expect'
import { expandTo18Decimals, encodePath, pool_DAI_WETH } from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { executeSwap, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, MAX_UINT } from './shared/constants'

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

function expandTo18DecimalsBN(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
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

describe('V3SwapRouter', () => {

  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract

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
    await daiContract.connect(alice).approve(weirollRouter.address, MAX_UINT)
  })

  it('bytecode size', async () => {
    expect(((await weirollRouter.provider.getCode(weirollRouter.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('#trade uniswap v3', () => {
    describe('with Router02', () => {
      const amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      const v3TradePromise = V3Trade.exactIn(new V3Route([pool_DAI_WETH], DAI, WETH), amountIn)
      const slippageTolerance = new Percent(50, 100)

      afterEach(async () => {
        await resetFork()
      })

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

    describe('with Weiroll', () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)

      const addV3ExactInTrades = (planner: RouterPlanner, numTrades: number, amountOutMin: number, tokens: string[] = [DAI.address, WETH.address]) => {
        const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
        for (let i = 0; i < numTrades; i++) {
          planner.add(new V3ExactInputCommand(alice.address, false, amountIn, amountOutMin, path))
        }
      }

      let planner: RouterPlanner

      beforeEach(async () => {
        planner = new RouterPlanner()
        await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(55))
      })

      afterEach(async () => {
        await resetFork()
      })

      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: number = 0.0005 * 10**18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceDaiBefore = await daiContract.balanceOf(alice.address)
        await weirollRouter.connect(alice).execute(commands, state)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceDaiAfter = await daiContract.balanceOf(alice.address)

        expect(balanceWethAfter.sub(balanceWethBefore)).to.be.gte(amountOutMin)
        expect(balanceDaiBefore.sub(balanceDaiAfter)).to.eq(amountIn)
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10**6
        addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
        const { commands, state } = planner.plan()

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        const balanceDaiBefore = await daiContract.balanceOf(alice.address)
        const balanceUsdcBefore = await usdcContract.balanceOf(alice.address)
        
        await weirollRouter.connect(alice).execute(commands, state)

        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        const balanceDaiAfter = await daiContract.balanceOf(alice.address)
        const balanceUsdcAfter = await usdcContract.balanceOf(alice.address)
      
        expect(balanceWethAfter).to.eq(balanceWethBefore)
        expect(balanceDaiBefore.sub(balanceDaiAfter)).to.eq(amountIn)
        expect(balanceUsdcAfter.sub(balanceUsdcBefore)).to.be.gte(amountOutMin)
      })

      it('gas: one trade, one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10**18
        addV3ExactInTrades(planner, 1, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })

      it('gas: six trades (all same), one hop, exactIn', async () => {
        const amountOutMin: number = 0.0005 * 10**18
        addV3ExactInTrades(planner, 6, amountOutMin)
        const { commands, state } = planner.plan()
        const tx = await weirollRouter.connect(alice).execute(commands, state)
        const receipt = await tx.wait()
        expect(receipt.gasUsed.toString()).to.matchSnapshot()
      })
    })
  })
})
