import type { Contract } from '@ethersproject/contracts'
import { Pair } from '@uniswap/v2-sdk'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { IPermit2, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, PERMIT2 } from './shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  ONE_PERCENT_BIPS,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { executeRouter } from './shared/executeRouter'
import { getPermitSignature, PermitSingle } from './shared/protocolHelpers/permit2'
import { ADDRESS_ZERO } from '@uniswap/v3-sdk'
const { ethers } = hre

describe('Uniswap V2 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: IPermit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner

  const amountIn: BigNumber = expandTo18DecimalsBN(5)

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
    permit2 = PERMIT2.connect(bob) as IPermit2
    router = (await deployUniversalRouter(bob.address)) as UniversalRouter
    planner = new RoutePlanner()

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(100000))

    // Bob max-approves the permit2 contract to access his DAI and WETH
    await daiContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)

    // for these tests Bob gives the router max approval on permit2
    await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
    await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
  })

  describe('Trade on Uniswap with Permit2, giving approval every time', () => {
    let permit: PermitSingle

    beforeEach(async () => {
      // cancel the permit on DAI
      await permit2.approve(DAI.address, router.address, 0, 0)
    })

    it('Permit2 can silently fail', async () => {
      const amountInDAI = expandTo18DecimalsBN(100)

      // bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: amountInDAI,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      // 1) permit the router to access funds, not allowing revert
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])

      // 2) permit the router to access funds again, allowing revert
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig], true)

      let nonce = (await permit2.allowance(bob.address, DAI.address, router.address)).nonce
      expect(nonce).to.eq(0)

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      nonce = (await permit2.allowance(bob.address, DAI.address, router.address)).nonce
      expect(nonce).to.eq(1)
    })

    it('V2 exactIn, permiting the exact amount', async () => {
      const amountInDAI = expandTo18DecimalsBN(100)
      const minAmountOutWETH = expandTo18DecimalsBN(0.02)

      // second bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: amountInDAI,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        amountInDAI,
        minAmountOutWETH,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      const { wethBalanceBefore, wethBalanceAfter, daiBalanceAfter, daiBalanceBefore } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountInDAI)
    })

    it('V2 exactOut, permiting the maxAmountIn', async () => {
      const maxAmountInDAI = expandTo18DecimalsBN(4000)
      const amountOutWETH = expandTo18DecimalsBN(1)

      // second bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: maxAmountInDAI,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      // 1) permit the router to access funds, 2) trade - the transfer happens within the trade for exactOut
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        MSG_SENDER,
        amountOutWETH,
        maxAmountInDAI,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      const { wethBalanceBefore, wethBalanceAfter, daiBalanceAfter, daiBalanceBefore } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutWETH)
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.lte(maxAmountInDAI)
    })

    it('V2 exactIn, swapping more than max_uint160 should revert', async () => {
      const max_uint = BigNumber.from(MAX_UINT160)
      const minAmountOutWETH = expandTo18DecimalsBN(0.03)

      // second bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: max_uint,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        BigNumber.from(MAX_UINT160).add(1),
        minAmountOutWETH,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])

      const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(testCustomErrors, 'UnsafeCast')
    })
  })

  describe('ERC20 --> ERC20', () => {
    it('completes a V2 exactIn swap', async () => {
      const minAmountOut = expandTo18DecimalsBN(0.0001)
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        amountIn,
        minAmountOut,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
    })

    it('completes a V2 exactOut swap', async () => {
      const amountOut = expandTo18DecimalsBN(1)
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        MSG_SENDER,
        amountOut,
        expandTo18DecimalsBN(10000),
        [WETH.address, DAI.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 0])
      const { daiBalanceBefore, daiBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gt(amountOut)
    })

    it('exactIn trade, where an output fee is taken', async () => {
      // back to the router so someone can take a fee
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        amountIn,
        1,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.PAY_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 1])

      const { commands, inputs } = planner
      const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)
      const wethBalanceBeforeBob = await wethContract.balanceOf(bob.address)

      await router.connect(bob)['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)
      const wethBalanceAfterBob = await wethContract.balanceOf(bob.address)

      const aliceFee = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)
      const bobEarnings = wethBalanceAfterBob.sub(wethBalanceBeforeBob)

      expect(bobEarnings).to.be.gt(0)
      expect(aliceFee).to.be.gt(0)

      // total fee is 1% of bob's output
      expect(aliceFee.add(bobEarnings).mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
    })

    it('completes a V2 exactIn swap with longer path', async () => {
      const minAmountOut = expandTo18DecimalsBN(0.0001)
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        amountIn,
        minAmountOut,
        [DAI.address, USDC.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])

      const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
    })
  })

  describe('ERC20 --> ETH', () => {
    it('completes a V2 exactIn swap', async () => {
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        ADDRESS_THIS,
        amountIn,
        1,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

      const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1Out: wethTraded } = v2SwapEventArgs!

      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.sub(gasSpent))
    })

    it('completes a V2 exactOut swap', async () => {
      const amountOut = expandTo18DecimalsBN(1)
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        ADDRESS_THIS,
        amountOut,
        expandTo18DecimalsBN(10000),
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])
      planner.addCommand(CommandType.SWEEP, [DAI.address, MSG_SENDER, 0])

      const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1Out: wethTraded } = v2SwapEventArgs!
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(amountOut.sub(gasSpent))
      expect(wethTraded).to.eq(amountOut)
    })

    it('completes a V2 exactOut swap, with ETH fee', async () => {
      const amountOut = expandTo18DecimalsBN(1)
      const totalPortion = amountOut.mul(ONE_PERCENT_BIPS).div(10000)
      const actualAmountOut = amountOut.sub(totalPortion)

      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        ADDRESS_THIS,
        amountOut,
        expandTo18DecimalsBN(10000),
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, amountOut])
      planner.addCommand(CommandType.PAY_PORTION, [ETH_ADDRESS, alice.address, ONE_PERCENT_BIPS])
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

      const { commands, inputs } = planner

      await expect(
        router.connect(bob)['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
      ).to.changeEtherBalances([alice, bob], [totalPortion, actualAmountOut])
    })
  })

  describe('ETH --> ERC20', () => {
    it('completes a V2 exactIn swap', async () => {
      const minAmountOut = expandTo18DecimalsBN(0.001)
      const pairAddress = Pair.getAddress(DAI, WETH)
      planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
      // amountIn of 0 because the weth is already in the pair
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        MSG_SENDER,
        0,
        minAmountOut,
        [WETH.address, DAI.address],
        SOURCE_MSG_SENDER,
      ])

      const { daiBalanceBefore, daiBalanceAfter, v2SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        amountIn
      )
      const { amount0Out: daiTraded } = v2SwapEventArgs!

      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.be.gt(minAmountOut)
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.equal(daiTraded)
    })

    it('completes a V2 exactOut swap', async () => {
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

      const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, v2SwapEventArgs, gasSpent } =
        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract, value)
      const { amount0Out: daiTraded, amount1In: wethTraded } = v2SwapEventArgs!
      expect(daiBalanceAfter.sub(daiBalanceBefore)).gt(amountOut) // rounding
      expect(daiBalanceAfter.sub(daiBalanceBefore)).eq(daiTraded)
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(wethTraded.add(gasSpent))
    })
  })
})
