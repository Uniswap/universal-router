import type { Contract } from '@ethersproject/contracts'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { Pair } from '@uniswap/v2-sdk'
import { FeeAmount } from '@uniswap/v3-sdk'
import { parseEvents, V2_EVENTS, V3_EVENTS } from './shared/parseEvents'
import { expect } from './shared/expect'
import { makePair, encodePath } from './shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { Permit2, Router } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { resetFork, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, CONTRACT_BALANCE, DEADLINE, ONE_PERCENT_BIPS } from './shared/constants'
import { expandTo18DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployRouter, { deployPermit2 } from './shared/deployRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
const { ethers } = hre

describe('Uniswap V2 and V3 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner

  // 6 pairs for gas tests with high numbers of trades
  let pair_DAI_WETH: Pair
  let pair_DAI_USDC: Pair

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
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    pair_DAI_USDC = await makePair(alice, DAI, USDC)
  })

  describe('Trade on UniswapV2 with Permit2', () => {
    let planner: RoutePlanner

    beforeEach(async () => {
      planner = new RoutePlanner()
    })

    describe('ERC20 --> ERC20', () => {
      it('completes a V2 exactIn swap', async () => {
        // the user approves permit2
        await daiContract.connect(bob).approve()
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])
        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
      })
    })
  })

  describe('Trade on UniswapV2', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(5)
    let planner: RoutePlanner

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
      await wethContract.approve(router.address, expandTo18DecimalsBN(5000))
    })

    describe('ERC20 --> ERC20', () => {
      it('completes a V2 exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])
        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
      })

      it('completes a V2 exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          amountOut,
          expandTo18DecimalsBN(10000),
          [WETH.address, DAI.address],
          alice.address,
        ])
        planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, 0])
        await wethContract.connect(alice).transfer(router.address, expandTo18DecimalsBN(100)) // TODO: permitPost
        const { daiBalanceBefore, daiBalanceAfter } = await executeRouter(planner)
        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gt(amountOut)
      })

      it('exactIn trade, where an output fee is taken', async () => {
        // will likely make the most sense to take fees on input with permit post in most situations
        planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
        // back to the router so someone can take a fee
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], router.address])
        planner.addCommand(CommandType.SWEEP_WITH_FEE, [WETH.address, alice.address, 1, ONE_PERCENT_BIPS, bob.address])

        const { commands, inputs } = planner
        const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceBeforeBob = await wethContract.balanceOf(bob.address)

        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

        const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceAfterBob = await wethContract.balanceOf(bob.address)

        const bobFee = wethBalanceAfterBob.sub(wethBalanceBeforeBob)
        const aliceEarnings = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)

        expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT_BIPS).div(10000)).to.eq(bobFee)
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_USDC.liquidityToken.address, amountIn])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          minAmountOut,
          [DAI.address, USDC.address, WETH.address],
          alice.address,
        ])
        const { commands, inputs } = planner

        const wethBalanceBefore = await wethContract.balanceOf(alice.address)
        await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()
        const wethBalanceAfter = await wethContract.balanceOf(alice.address)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
      })
    })

    describe('ERC20 --> ETH', () => {
      it('completes a V2 exactIn swap', async () => {
        planner.addCommand(CommandType.TRANSFER, [DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], router.address])
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

        const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethTraded } = v2SwapEventArgs!

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.sub(gasSpent))
      })

      it('completes a V2 exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          amountOut,
          expandTo18DecimalsBN(10000),
          [DAI.address, WETH.address],
          router.address,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, amountOut])
        planner.addCommand(CommandType.SWEEP, [DAI.address, alice.address, 0])

        const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethTraded } = v2SwapEventArgs!
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(amountOut.sub(gasSpent))
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.sub(gasSpent))
      })

      it('completes a V2 exactOut swap, with ETH fee', async () => {
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
          ONE_PERCENT_BIPS,
          bob.address,
        ])

        const { commands, inputs } = planner
        const ethBalanceBeforeAlice = await ethers.provider.getBalance(alice.address)
        const ethBalanceBeforeBob = await ethers.provider.getBalance(bob.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()

        const ethBalanceAfterAlice = await ethers.provider.getBalance(alice.address)
        const ethBalanceAfterBob = await ethers.provider.getBalance(bob.address)
        const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        const bobFee = ethBalanceAfterBob.sub(ethBalanceBeforeBob)
        const aliceEarnings = ethBalanceAfterAlice.sub(ethBalanceBeforeAlice).add(gasSpent)

        expect(bobFee.add(aliceEarnings).mul(ONE_PERCENT_BIPS).div(10000)).to.eq(bobFee)
      })
    })

    describe('ETH --> ERC20', () => {
      it('completes a V2 exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.001)
        const pairAddress = Pair.getAddress(DAI, WETH)
        planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [minAmountOut, [WETH.address, DAI.address], alice.address])

        const { daiBalanceBefore, daiBalanceAfter, v2SwapEventArgs } = await executeRouter(planner, amountIn)
        const { amount0Out: daiTraded } = v2SwapEventArgs!

        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gt(minAmountOut)
        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.equal(daiTraded)
      })

      it('completes a V2 exactOut swap', async () => {
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

        const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, v2SwapEventArgs, gasSpent } =
          await executeRouter(planner, value)
        const { amount0Out: daiTraded, amount1In: wethTraded } = v2SwapEventArgs!
        expect(daiBalanceAfter.sub(daiBalanceBefore)).gt(amountOut) // rounding
        expect(daiBalanceAfter.sub(daiBalanceBefore)).eq(daiTraded)
        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(wethTraded.add(gasSpent))
      })
    })
  })

  describe('Trade on UniswapV3', () => {
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
      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addV3ExactInTrades(planner, 1, amountOutMin)

        const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
        const { amount1: wethTraded } = v3SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(amountOutMin)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded.mul(-1))
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(planner, 1, amountOutMin, alice.address, [DAI.address, WETH.address, USDC.address])

        const { wethBalanceBefore, wethBalanceAfter, usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(
          planner
        )

        expect(wethBalanceAfter).to.eq(wethBalanceBefore)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactOut swap', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])

        const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
        const { amount0: daiTraded } = v3SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(amountOut)
        expect(daiTraded).to.be.lt(amountInMax)
      })

      it('completes a V3 exactOut swap with longer path', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, USDC.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])
        const { commands, inputs } = planner

        const balanceWethBefore = await wethContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const balanceWethAfter = await wethContract.balanceOf(alice.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })
    })

    describe('ERC20 --> ETH', () => {
      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addV3ExactInTrades(planner, 1, amountOutMin, router.address)
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

        const { ethBalanceBefore, ethBalanceAfter, v3SwapEventArgs, gasSpent } = await executeRouter(planner)
        const { amount1: wethTraded } = v3SwapEventArgs!

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.gte(amountOutMin.sub(gasSpent))
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.mul(-1).sub(gasSpent))
      })

      it('completes a V3 exactOut swap', async () => {
        // trade DAI in for WETH out
        const tokens = [DAI.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [router.address, amountOut, amountInMax, path])
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, amountOut])

        const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(planner)

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(amountOut.sub(gasSpent))
      })
    })

    describe('ETH --> ERC20', () => {
      it('completes a V3 exactIn swap', async () => {
        const tokens = [WETH.address, DAI.address]
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.WRAP_ETH, [router.address, amountIn])
        addV3ExactInTrades(planner, 1, amountOutMin, alice.address, tokens)

        const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, gasSpent } = await executeRouter(
          planner,
          amountIn
        )

        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(amountIn.add(gasSpent))
        expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactOut swap', async () => {
        const tokens = [WETH.address, DAI.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.WRAP_ETH, [router.address, amountInMax])
        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [alice.address, amountOut, amountInMax, path])
        planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, CONTRACT_BALANCE])

        const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, gasSpent, v3SwapEventArgs } =
          await executeRouter(planner, amountInMax)
        const { amount0: daiTraded, amount1: wethTraded } = v3SwapEventArgs!

        expect(daiBalanceBefore.sub(daiBalanceAfter)).to.eq(daiTraded)
        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(wethTraded.add(gasSpent))
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
          ])
          planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [v2AmountOutMin, v2Tokens, alice.address])

          const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
          const { amount1Out: wethTraded } = v2SwapEventArgs!
          expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded)
        })

        it('V2, then V3', async () => {
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

          const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
          const { amount1: wethTraded } = v3SwapEventArgs!
          expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded.mul(-1))
        })
      })

      describe('Split routes', () => {
        it('ERC20 --> ERC20 split V2 and V3, one hop', async () => {
          const tokens = [DAI.address, WETH.address]
          const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
          const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
          const minAmountOut = expandTo18DecimalsBN(0.0005)

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
          planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, minAmountOut])

          const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(planner)
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

          const { usdcBalanceBefore, usdcBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
            planner,
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

          const { ethBalanceBefore, ethBalanceAfter, gasSpent, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
            planner
          )
          const { amount1Out: wethOutV2 } = v2SwapEventArgs!
          let { amount1: wethOutV3 } = v3SwapEventArgs!
          wethOutV3 = wethOutV3.mul(-1)

          expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethOutV2.add(wethOutV3).sub(gasSpent))
        })

        it('ERC20 --> ETH split V2 and V3, exactOut, one hop', async () => {
          // TODO: Use permit
          await daiContract.transfer(router.address, expandTo18DecimalsBN(4000))

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
          ])
          planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [router.address, v3AmountOut, maxAmountIn, path])
          // aggregate slippate check
          planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, fullAmountOut])

          const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(planner)

          // TODO: permit2 test alice doesn't send more than maxAmountIn DAI
          expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(fullAmountOut.sub(gasSpent))
        })
      })
    })
  })

  type V2SwapEventArgs = {
    amount0In: BigNumber
    amount0Out: BigNumber
    amount1In: BigNumber
    amount1Out: BigNumber
  }

  type V3SwapEventArgs = {
    amount0: BigNumber
    amount1: BigNumber
  }

  type ExecutionParams = {
    wethBalanceBefore: BigNumber
    wethBalanceAfter: BigNumber
    daiBalanceBefore: BigNumber
    daiBalanceAfter: BigNumber
    usdcBalanceBefore: BigNumber
    usdcBalanceAfter: BigNumber
    ethBalanceBefore: BigNumber
    ethBalanceAfter: BigNumber
    v2SwapEventArgs: V2SwapEventArgs | undefined
    v3SwapEventArgs: V3SwapEventArgs | undefined
    receipt: TransactionReceipt
    gasSpent: BigNumber
  }

  async function executeRouter(planner: RoutePlanner, value?: BigNumberish): Promise<ExecutionParams> {
    const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(alice.address)
    const wethBalanceBefore: BigNumber = await wethContract.balanceOf(alice.address)
    const daiBalanceBefore: BigNumber = await daiContract.balanceOf(alice.address)
    const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(alice.address)

    const { commands, inputs } = planner

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const v2SwapEventArgs = parseEvents(V2_EVENTS, receipt)[0]?.args as unknown as V2SwapEventArgs
    const v3SwapEventArgs = parseEvents(V3_EVENTS, receipt)[0]?.args as unknown as V3SwapEventArgs

    const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(alice.address)
    const wethBalanceAfter: BigNumber = await wethContract.balanceOf(alice.address)
    const daiBalanceAfter: BigNumber = await daiContract.balanceOf(alice.address)
    const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(alice.address)

    return {
      wethBalanceBefore,
      wethBalanceAfter,
      daiBalanceBefore,
      daiBalanceAfter,
      usdcBalanceBefore,
      usdcBalanceAfter,
      ethBalanceBefore,
      ethBalanceAfter,
      v2SwapEventArgs,
      v3SwapEventArgs,
      receipt,
      gasSpent,
    }
  }

  function encodePathExactInput(tokens: string[]) {
    return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }

  function encodePathExactOutput(tokens: string[]) {
    return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }
})
