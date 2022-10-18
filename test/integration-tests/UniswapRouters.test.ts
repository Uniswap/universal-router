import type { Contract } from '@ethersproject/contracts'
import { Pair } from '@uniswap/v2-sdk'
import { FeeAmount } from '@uniswap/v3-sdk'
import { parseEvents, V2_EVENTS } from './shared/parseEvents'
import { expect } from './shared/expect'
import {
  makePair,
  encodePath,
} from './shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { Router } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { resetFork, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
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
import { RoutePlanner, CommandType } from './shared/planner'
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
  let planner: RoutePlanner

  // 6 pairs for gas tests with high numbers of trades
  let pair_DAI_WETH: Pair

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
  })

  describe('Trade on UniswapV2', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(5)
    let planner: RoutePlanner

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
      await wethContract.connect(alice).approve(router.address, expandTo18DecimalsBN(5000))
    })

    it('completes a V2 exactIn swap', async () => {
      planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])

      const commands = planner.commands
      const inputs = planner.inputs

      const balanceBefore = await wethContract.balanceOf(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()
      const balanceAfter = await wethContract.balanceOf(alice.address)
      const amountOut = parseEvents(V2_EVENTS, receipt).reduce(
        (prev, current) => prev.add(current!.args.amount1Out),
        expandTo18DecimalsBN(0)
      )
      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
    })

    it('completes a V2 exactIn swap ETH', async () => {
      const pairAddress = Pair.getAddress(DAI, WETH)
      planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [amountIn, [WETH.address, DAI.address], alice.address])

      const commands = planner.commands
      const inputs = planner.inputs

      const daiBalanceBefore = await daiContract.balanceOf(alice.address)
      const ethBalanceBefore = await ethers.provider.getBalance(alice.address)

      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn.toString() })
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
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        amountOut,
        expandTo18DecimalsBN(10000),
        [WETH.address, DAI.address],
        alice.address,
      ])
      planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, 0])
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceWethBefore = await wethContract.balanceOf(alice.address)
      const balanceDaiBefore = await daiContract.balanceOf(alice.address)
      await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100)) // TODO: permitPost
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()
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
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        amountOut,
        expandTo18DecimalsBN(10000),
        [DAI.address, WETH.address],
        router.address,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

      const commands = planner.commands
      const inputs = planner.inputs
      const ethBalanceBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()

      const ethBalanceAfter = await ethers.provider.getBalance(alice.address)
      const ethDelta = ethBalanceAfter.sub(ethBalanceBefore)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

      expect(ethDelta).to.eq(amountOut.sub(gasSpent))
    })

    it('completes a V2 exactOut swap ETH, with ETH fee', async () => {
      const amountOut = expandTo18DecimalsBN(1)
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        amountOut,
        expandTo18DecimalsBN(10000),
        [DAI.address, WETH.address],
        router.address,
      ])
      const ONE_PERCENT = 100
      planner.addCommand(CommandType.UNWRAP_WETH_WITH_FEE, [alice.address, CONTRACT_BALANCE, ONE_PERCENT, bob.address])

      const commands = planner.commands
      const inputs = planner.inputs
      const ethBalanceBeforeAlice = await ethers.provider.getBalance(alice.address)
      const ethBalanceBeforeBob = await ethers.provider.getBalance(bob.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()

      const ethBalanceAfterAlice = await ethers.provider.getBalance(alice.address)
      const ethBalanceAfterBob = await ethers.provider.getBalance(bob.address)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

      const bobFee = ethBalanceAfterBob.sub(ethBalanceBeforeBob)
      const aliceEarnings = ethBalanceAfterAlice.sub(ethBalanceBeforeAlice).add(gasSpent)

      expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT).div(10000)).to.eq(bobFee)
    })

    it('exactIn trade, where an output fee is taken', async () => {
      // will likely make the most sense to take fees on input with permit post in most situations
      planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])

      // back to the router so someone can take a fee
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], router.address])

      const ONE_PERCENT = 100
      planner.addCommand(CommandType.SWEEP_WITH_FEE, [WETH.address, alice.address, 1, ONE_PERCENT, bob.address])

      const commands = planner.commands
      const inputs = planner.inputs
      const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)
      const wethBalanceBeforeBob = await wethContract.balanceOf(bob.address)

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)
      const wethBalanceAfterBob = await wethContract.balanceOf(bob.address)

      const bobFee = wethBalanceAfterBob.sub(wethBalanceBeforeBob)
      const aliceEarnings = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)

      expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT).div(10000)).to.eq(bobFee)
    })

    it('completes a V2 exactIn swap with longer path', async () => {
      planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address, USDC.address], alice.address])
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceBefore = await usdcContract.balanceOf(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()
      const balanceAfter = await usdcContract.balanceOf(alice.address)
      const events = parseEvents(V2_EVENTS, receipt)
      const amountOut = events[events.length - 1]!.args.amount0Out
      expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
    })
  })

  describe('Trade on UniswapV3', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(5)
    const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
    const amountOut: BigNumber = expandTo18DecimalsBN(1)

    const addV3ExactInTrades = (
      planner: RoutePlanner,
      numTrades: number,
      amountOutMin: number,
      tokens: string[] = [DAI.address, WETH.address]
    ) => {
      const path = encodePathExactInput(tokens)
      for (let i = 0; i < numTrades; i++) {
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [alice.address, amountIn, amountOutMin, path])
      }
    }

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(1000000))
    })

    it('completes a V3 exactIn swap', async () => {
      const amountOutMin: number = 0.0005 * 10 ** 18
      addV3ExactInTrades(planner, 1, amountOutMin)
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceWethBefore = await wethContract.balanceOf(alice.address)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
      const balanceWethAfter = await wethContract.balanceOf(alice.address)
      expect(balanceWethAfter.sub(balanceWethBefore)).to.be.gte(amountOutMin)
    })

    it('completes a V3 exactIn swap with longer path', async () => {
      const amountOutMin: number = 3 * 10 ** 6
      addV3ExactInTrades(planner, 1, amountOutMin, [DAI.address, WETH.address, USDC.address])
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceWethBefore = await wethContract.balanceOf(alice.address)
      const balanceUsdcBefore = await usdcContract.balanceOf(alice.address)

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      const balanceWethAfter = await wethContract.balanceOf(alice.address)
      const balanceUsdcAfter = await usdcContract.balanceOf(alice.address)

      expect(balanceWethAfter).to.eq(balanceWethBefore)
      expect(balanceUsdcAfter.sub(balanceUsdcBefore)).to.be.gte(amountOutMin)
    })

    it('completes a V3 exactOut swap', async () => {
      // trade DAI in for WETH out
      const tokens = [DAI.address, WETH.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceWethBefore = await wethContract.balanceOf(alice.address)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
      const balanceWethAfter = await wethContract.balanceOf(alice.address)
      expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
    })

    it('completes a V3 exactOut swap with longer path', async () => {
      // trade DAI in for WETH out
      const tokens = [DAI.address, USDC.address, WETH.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])
      const commands = planner.commands
      const inputs = planner.inputs

      const balanceWethBefore = await wethContract.balanceOf(alice.address)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
      const balanceWethAfter = await wethContract.balanceOf(alice.address)
      expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
    })
  })
})
