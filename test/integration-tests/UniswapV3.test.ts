import { Contract } from 'ethers'
import { expect } from './shared/expect'
import { IPermit2, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, PERMIT2 } from './shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  DEADLINE,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import deployUniversalRouter from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { encodePathExactInput, encodePathExactOutput } from './shared/swapRouter02Helpers'
import { executeRouter } from './shared/executeRouter'
import { getPermitSignature, PermitSingle } from './shared/protocolHelpers/permit2'
import { ADDRESS_ZERO } from '@uniswap/v3-sdk'
const { ethers } = hre

describe('Uniswap V3 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: IPermit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner
  let permit2Address: string
  let routerAddress: string

  const amountIn: bigint = expandTo18DecimalsBN(500)
  const amountInMax: bigint = expandTo18DecimalsBN(5000)
  const amountOut: bigint = expandTo18DecimalsBN(1)

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
    permit2 = PERMIT2.connect(bob) as unknown as IPermit2
    router = (await deployUniversalRouter(bob.address)) as unknown as UniversalRouter
    planner = new RoutePlanner()
    permit2Address = await permit2.getAddress()
    routerAddress = await router.getAddress()

    // alice gives bob some tokens
    await (daiContract.connect(alice) as Contract).transfer(bob.address, expandTo18DecimalsBN(100000))
    await (wethContract.connect(alice) as Contract).transfer(bob.address, expandTo18DecimalsBN(100))
    await (usdcContract.connect(alice) as Contract).transfer(bob.address, expandTo6DecimalsBN(100000))

    // Bob max-approves the permit2 contract to access his DAI and WETH
    await (daiContract.connect(bob) as Contract).approve(permit2Address, MAX_UINT)
    await (wethContract.connect(bob) as Contract).approve(permit2Address, MAX_UINT)
    await (usdcContract.connect(bob) as Contract).approve(permit2Address, MAX_UINT)

    // for these tests Bob gives the router max approval on permit2
    await permit2.approve(DAI.address, routerAddress, MAX_UINT160, DEADLINE)
    await permit2.approve(WETH.address, routerAddress, MAX_UINT160, DEADLINE)
  })

  const addV3ExactInTrades = (
    planner: RoutePlanner,
    numTrades: number,
    amountOutMin: bigint | number,
    recipient?: string,
    tokens: string[] = [DAI.address, WETH.address],
    tokenSource: boolean = SOURCE_MSG_SENDER
  ) => {
    const path = encodePathExactInput(tokens)
    for (let i = 0; i < numTrades; i++) {
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        recipient ?? MSG_SENDER,
        amountIn,
        amountOutMin,
        path,
        tokenSource,
      ])
    }
  }

  describe('Trade on Uniswap with Permit2, giving approval every time', () => {
    let permit: PermitSingle

    beforeEach(async () => {
      // cancel the permit on DAI
      await permit2.approve(DAI.address, ADDRESS_ZERO, 0, 0)
    })

    it('V3 exactIn, permiting the exact amount', async () => {
      const amountInDAI = expandTo18DecimalsBN(100)
      const minAmountOutWETH = expandTo18DecimalsBN(0.02)

      // first bob approves permit2 to access his DAI
      await (daiContract.connect(bob) as Contract).approve(permit2Address, MAX_UINT)

      // second bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: amountInDAI,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: routerAddress,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      const path = encodePathExactInput([DAI.address, WETH.address])

      // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        MSG_SENDER,
        amountInDAI,
        minAmountOutWETH,
        path,
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
      expect(wethBalanceAfter - wethBalanceBefore).to.be.gte(minAmountOutWETH)
      expect(daiBalanceBefore - daiBalanceAfter).to.be.eq(amountInDAI)
    })

    it('V3 exactOut, permiting the exact amount', async () => {
      const maxAmountInDAI = expandTo18DecimalsBN(4000)
      const amountOutWETH = expandTo18DecimalsBN(1)

      // first bob approves permit2 to access his DAI
      await (daiContract.connect(bob) as Contract).approve(permit2Address, MAX_UINT)

      // second bob signs a permit to allow the router to access his DAI
      permit = {
        details: {
          token: DAI.address,
          amount: maxAmountInDAI,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: routerAddress,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      const path = encodePathExactOutput([DAI.address, WETH.address])

      // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
        MSG_SENDER,
        amountOutWETH,
        maxAmountInDAI,
        path,
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
      expect(wethBalanceAfter - wethBalanceBefore).to.be.eq(amountOutWETH)
      expect(daiBalanceBefore - daiBalanceAfter).to.be.lte(maxAmountInDAI)
    })
  })

  describe('ERC20 --> ERC20', () => {
    it('completes a V3 exactIn swap', async () => {
      const amountOutMin: bigint = expandTo18DecimalsBN(0.0005)
      addV3ExactInTrades(planner, 1, amountOutMin)

      const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1: wethTraded } = v3SwapEventArgs!
      expect(wethBalanceAfter - wethBalanceBefore).to.be.gte(amountOutMin)
      expect(wethBalanceAfter - wethBalanceBefore).to.eq(-wethTraded)
    })

    it('completes a V3 exactIn swap with longer path', async () => {
      const amountOutMin: number = 3 * 10 ** 6
      addV3ExactInTrades(
        planner,
        1,
        amountOutMin,
        MSG_SENDER,
        [DAI.address, WETH.address, USDC.address],
        SOURCE_MSG_SENDER
      )

      const {
        daiBalanceBefore,
        daiBalanceAfter,
        wethBalanceBefore,
        wethBalanceAfter,
        usdcBalanceBefore,
        usdcBalanceAfter,
      } = await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      expect(daiBalanceBefore - amountIn).to.eq(daiBalanceAfter)
      expect(wethBalanceAfter).to.eq(wethBalanceBefore)
      expect(usdcBalanceAfter - usdcBalanceBefore).to.be.gte(amountOutMin)
    })

    it('completes a V3 exactOut swap', async () => {
      // trade DAI in for WETH out
      const tokens = [DAI.address, WETH.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])

      const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount0: daiTraded } = v3SwapEventArgs!
      expect(wethBalanceAfter - wethBalanceBefore).to.eq(amountOut)
      expect(daiTraded).to.be.lt(amountInMax)
    })

    it('completes a V3 exactOut swap with longer path', async () => {
      // trade DAI in for WETH out
      const tokens = [DAI.address, USDC.address, WETH.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])
      const { commands, inputs } = planner

      const balanceWethBefore = await wethContract.balanceOf(bob.address)
      await router.connect(bob)['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
      const balanceWethAfter = await wethContract.balanceOf(bob.address)
      expect(balanceWethAfter - balanceWethBefore).to.eq(amountOut)
    })
  })

  describe('ERC20 --> ETH', () => {
    it('completes a V3 exactIn swap', async () => {
      const amountOutMin: bigint = expandTo18DecimalsBN(0.0005)
      addV3ExactInTrades(planner, 1, amountOutMin, ADDRESS_THIS)
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

      const { ethBalanceBefore, ethBalanceAfter, v3SwapEventArgs, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )
      const { amount1: wethTraded } = v3SwapEventArgs!

      expect(ethBalanceAfter - ethBalanceBefore).to.be.gte(amountOutMin - gasSpent)
      expect(ethBalanceAfter - ethBalanceBefore).to.eq(-wethTraded - gasSpent)
    })

    it('completes a V3 exactOut swap', async () => {
      // trade DAI in for WETH out
      const tokens = [DAI.address, WETH.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [ADDRESS_THIS, amountOut, amountInMax, path, SOURCE_MSG_SENDER])
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])

      const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract
      )

      expect(ethBalanceAfter - ethBalanceBefore).to.eq(amountOut - gasSpent)
    })
  })

  describe('ETH --> ERC20', () => {
    it('completes a V3 exactIn swap', async () => {
      const tokens = [WETH.address, DAI.address]
      const amountOutMin: bigint = expandTo18DecimalsBN(0.0005)

      planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountIn])
      addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, tokens, SOURCE_ROUTER)

      const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, gasSpent } = await executeRouter(
        planner,
        bob,
        router,
        wethContract,
        daiContract,
        usdcContract,
        amountIn
      )

      expect(ethBalanceBefore - ethBalanceAfter).to.eq(amountIn + gasSpent)
      expect(daiBalanceAfter - daiBalanceBefore).to.be.gte(amountOutMin)
    })

    it('completes a V3 exactOut swap', async () => {
      const tokens = [WETH.address, DAI.address]
      const path = encodePathExactOutput(tokens)

      planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountInMax])
      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_ROUTER])
      planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

      const { ethBalanceBefore, ethBalanceAfter, daiBalanceBefore, daiBalanceAfter, gasSpent, v3SwapEventArgs } =
        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract, amountInMax)
      const { amount0: daiTraded, amount1: wethTraded } = v3SwapEventArgs!

      expect(daiBalanceBefore - daiBalanceAfter).to.eq(daiTraded)
      expect(ethBalanceBefore - ethBalanceAfter).to.eq(wethTraded + gasSpent)
    })
  })
})
