import { Pool } from '@uniswap/v3-sdk'
import { Pair, Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import {
  encodePath,
  expandTo18Decimals,
  pool_DAI_USDT,
  pool_DAI_WETH,
  pool_USDC_USDT,
  pool_USDC_WETH,
} from '../shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { SwapRouter } from '@uniswap/router-sdk'
import {
  executeSwapRouter02Swap,
  resetFork,
  DAI,
  USDC,
  approveSwapRouter02,
  PERMIT2,
} from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MAX_UINT, MAX_UINT160, SOURCE_MSG_SENDER } from '../shared/constants'
import { expandTo6DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter from '../shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import hre from 'hardhat'
import { UniversalRouter, ERC20__factory, ERC20, IPermit2 } from '../../../typechain'
import { getPermitSignature, PermitSingle } from '../shared/protocolHelpers/permit2'
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { IRoute, Trade } from '@uniswap/router-sdk'
const { ethers } = hre

describe('Uniswap UX Tests gas:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter

  let permit2: IPermit2
  let usdcContract: ERC20
  let planner: RoutePlanner

  let SIMPLE_SWAP: Trade<Token, Token, TradeType.EXACT_INPUT>
  let COMPLEX_SWAP: Trade<Token, Token, TradeType.EXACT_INPUT>
  let MAX_PERMIT: PermitSingle
  let SIMPLE_SWAP_PERMIT: PermitSingle
  let COMPLEX_SWAP_PERMIT: PermitSingle

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    usdcContract = ERC20__factory.connect(USDC.address, alice)

    permit2 = PERMIT2.connect(alice) as IPermit2
    router = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter

    planner = new RoutePlanner()

    // Alice gives bob some tokens
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(10000000))

    /*
      Simple Swap =
      1000 USDC —V3→ ETH —V3→ DAI

      Complex Swap =
      3000 USDC —V3—> ETH — V3—> DAI
      4000 USDC —V3—> USDT —V3—>DAI
      3000 USDC —V2—> DAI
    */

    const USDC_DAI_V2 = new Pair(
      CurrencyAmount.fromRawAmount(USDC, 10000000),
      CurrencyAmount.fromRawAmount(DAI, 10000000)
    )

    const simpleSwapAmountInUSDC = CurrencyAmount.fromRawAmount(USDC, expandTo6DecimalsBN(1000).toString())
    const complexSwapAmountInSplit1 = CurrencyAmount.fromRawAmount(USDC, expandTo6DecimalsBN(3000).toString())
    const complexSwapAmountInSplit2 = CurrencyAmount.fromRawAmount(USDC, expandTo6DecimalsBN(4000).toString())
    const complexSwapAmountInSplit3 = CurrencyAmount.fromRawAmount(USDC, expandTo6DecimalsBN(3000).toString())

    SIMPLE_SWAP = new Trade({
      v3Routes: [
        {
          routev3: new V3RouteSDK([pool_USDC_WETH, pool_DAI_WETH], USDC, DAI),
          inputAmount: simpleSwapAmountInUSDC,
          outputAmount: CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(1000)),
        },
      ],
      v2Routes: [],
      tradeType: TradeType.EXACT_INPUT,
    })

    COMPLEX_SWAP = new Trade({
      v3Routes: [
        {
          routev3: new V3RouteSDK([pool_USDC_WETH, pool_DAI_WETH], USDC, DAI),
          inputAmount: complexSwapAmountInSplit1,
          outputAmount: CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(3000)),
        },
        {
          routev3: new V3RouteSDK([pool_USDC_USDT, pool_DAI_USDT], USDC, DAI),
          inputAmount: complexSwapAmountInSplit2,
          outputAmount: CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(4000)),
        },
      ],
      v2Routes: [
        {
          routev2: new V2RouteSDK([USDC_DAI_V2], USDC, DAI),
          inputAmount: complexSwapAmountInSplit3,
          outputAmount: CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(3000)),
        },
      ],

      tradeType: TradeType.EXACT_INPUT,
    })

    MAX_PERMIT = {
      details: {
        token: COMPLEX_SWAP.inputAmount.currency.address,
        amount: BigNumber.from(MAX_UINT160),
        expiration: DEADLINE, // not the end of time, cheaper gas-wise
        nonce: 0, // this is his first trade
      },
      spender: router.address,
      sigDeadline: DEADLINE,
    }

    SIMPLE_SWAP_PERMIT = {
      details: {
        token: SIMPLE_SWAP.inputAmount.currency.address,
        amount: BigNumber.from(SIMPLE_SWAP.inputAmount.quotient.toString()),
        expiration: 0, // expiration of 0 is block.timestamp
        nonce: 0, // this is his first trade
      },
      spender: router.address,
      sigDeadline: DEADLINE,
    }

    COMPLEX_SWAP_PERMIT = {
      details: {
        token: COMPLEX_SWAP.inputAmount.currency.address,
        amount: BigNumber.from(COMPLEX_SWAP.inputAmount.quotient.toString()),
        expiration: 0, // expiration of 0 is block.timestamp
        nonce: 0, // this is his first trade
      },
      spender: router.address,
      sigDeadline: DEADLINE,
    }
  })

  async function executeTradeUniversalRouter(
    planner: RoutePlanner,
    trade: Trade<Token, Token, TradeType.EXACT_INPUT>,
    overrideRouter?: UniversalRouter
  ): Promise<BigNumber> {
    for (let i = 0; i < trade.swaps.length; i++) {
      let swap = trade.swaps[i]
      let route = trade.routes[i]
      let amountIn = BigNumber.from(swap.inputAmount.quotient.toString())

      if (swap.route.protocol == 'V2') {
        let pathAddresses = routeToAddresses(route)
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [bob.address, amountIn, 0, pathAddresses, SOURCE_MSG_SENDER])
      } else if (swap.route.protocol == 'V3') {
        let path = encodePathExactInput(route)
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [bob.address, amountIn, 0, path, SOURCE_MSG_SENDER])
      } else {
        console.log('invalid protocol')
      }
    }

    const { commands, inputs } = planner
    const tx = await (overrideRouter ?? router)['execute(bytes,bytes[])'](commands, inputs)
    const gasUsed = (await tx.wait()).gasUsed

    return gasUsed
  }

  describe('Approvals', async () => {
    it('Cost for infinite approval of permit2/swaprouter02 contract', async () => {
      // Bob max-approves the permit2 contract to access his DAI and WETH
      await snapshotGasCost(await usdcContract.approve(PERMIT2.address, MAX_UINT))
    })
  })

  describe('Comparisons', async () => {
    let approvePermit2Gas: BigNumber
    let approveSwapRouter02Gas: BigNumber

    beforeEach(async () => {
      // bob has already given his infinite approval of USDC to permit2
      const permitApprovalTx = await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
      const receipt = await permitApprovalTx.wait()
      approvePermit2Gas = receipt.gasUsed

      const swapRouter02ApprovalTx = (await approveSwapRouter02(bob, USDC))!
      approveSwapRouter02Gas = swapRouter02ApprovalTx.gasUsed
    })

    describe('One Time Swapper - Simple Swap', async () => {
      it('SwapRouter02', async () => {
        const { calldata } = SwapRouter.swapCallParameters(SIMPLE_SWAP, {
          slippageTolerance: new Percent(10, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        const swapTx = await (await executeSwapRouter02Swap({ value: '0', calldata }, bob)).wait()
        const swapGas = swapTx.gasUsed

        await snapshotGasCost(approveSwapRouter02Gas.add(swapGas))
      })

      it('Permit2 Sign Per Swap', async () => {
        const sig = await getPermitSignature(SIMPLE_SWAP_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [SIMPLE_SWAP_PERMIT, sig])

        const gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)

        await snapshotGasCost(approvePermit2Gas.add(gasUsed))
      })

      it('Permit2 Max Approval Swap', async () => {
        const sig = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, sig])

        const gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)

        await snapshotGasCost(approvePermit2Gas.add(gasUsed))
      })
    })

    describe('One Time Swapper - Complex Swap', async () => {
      it('SwapRouter02', async () => {
        const { calldata } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        const swapTx = await (await executeSwapRouter02Swap({ value: '0', calldata }, bob)).wait()
        const swapGas = swapTx.gasUsed

        await snapshotGasCost(approveSwapRouter02Gas.add(swapGas))
      })

      it('Permit2 Sign Per Swap', async () => {
        // sign the permit for this swap
        const sig = await getPermitSignature(COMPLEX_SWAP_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [COMPLEX_SWAP_PERMIT, sig])

        const gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        await snapshotGasCost(approvePermit2Gas.add(gasUsed))
      })

      it('Permit2 Max Approval Swap', async () => {
        // send approval for the total input amount
        const sig = await getPermitSignature(MAX_PERMIT, bob, permit2)

        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, sig])

        const gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        await snapshotGasCost(approvePermit2Gas.add(gasUsed))
      })
    })

    describe('Casual Swapper - 3 swaps', async () => {
      it('SwapRouter02', async () => {
        const { calldata: callDataComplex } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        const { calldata: callDataSimple } = SwapRouter.swapCallParameters(SIMPLE_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        let totalGas = approveSwapRouter02Gas

        // Swap 1 (complex)
        const tx1 = await executeSwapRouter02Swap({ value: '0', calldata: callDataComplex }, bob)
        totalGas = totalGas.add((await tx1.wait()).gasUsed)

        // Swap 2 (complex)
        const tx2 = await executeSwapRouter02Swap({ value: '0', calldata: callDataComplex }, bob)
        totalGas = totalGas.add((await tx2.wait()).gasUsed)

        // Swap 3 (simple)
        const tx3 = await executeSwapRouter02Swap({ value: '0', calldata: callDataSimple }, bob)
        totalGas = totalGas.add((await tx3.wait()).gasUsed)

        await snapshotGasCost(totalGas)
      })

      it('Permit2 Sign Per Swap', async () => {
        let totalGas = approvePermit2Gas

        // Swap 1: complex
        let sig = await getPermitSignature(COMPLEX_SWAP_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [COMPLEX_SWAP_PERMIT, sig])
        let gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        totalGas = totalGas.add(gasUsed)
        planner = new RoutePlanner()

        // Swap 2: complex
        sig = await getPermitSignature(COMPLEX_SWAP_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [COMPLEX_SWAP_PERMIT, sig])
        gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        totalGas = totalGas.add(gasUsed)
        planner = new RoutePlanner()

        // Swap 3: simple
        sig = await getPermitSignature(SIMPLE_SWAP_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [SIMPLE_SWAP_PERMIT, sig])
        gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)

        totalGas = totalGas.add(gasUsed)
        await snapshotGasCost(totalGas)
      })

      it('Permit2 Max Approval Swap', async () => {
        let totalGas = approvePermit2Gas

        // Swap 1: complex, but give max approval no more approvals needed
        let sig = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, sig])
        let gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        totalGas = totalGas.add(gasUsed)
        planner = new RoutePlanner()

        // Swap 2: complex
        gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

        totalGas = totalGas.add(gasUsed)
        planner = new RoutePlanner()

        // Swap 3: simple
        gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)

        totalGas = totalGas.add(gasUsed)
        await snapshotGasCost(totalGas)
      })
    })

    describe('Frequent Swapper - 10 swaps', async () => {
      it('SwapRouter02', async () => {
        const { calldata: callDataComplex } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        const { calldata: callDataSimple } = SwapRouter.swapCallParameters(SIMPLE_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        let totalGas = approveSwapRouter02Gas

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          const tx = await executeSwapRouter02Swap({ value: '0', calldata: callDataComplex }, bob)
          totalGas = totalGas.add((await tx.wait()).gasUsed)
        }

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          const tx = await executeSwapRouter02Swap({ value: '0', calldata: callDataSimple }, bob)
          totalGas = totalGas.add((await tx.wait()).gasUsed)
        }

        await snapshotGasCost(totalGas)
      })

      it('Permit2 Sign Per Swap', async () => {
        let totalGas = approvePermit2Gas
        let sig: string
        let gasUsed: BigNumber

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          sig = await getPermitSignature(COMPLEX_SWAP_PERMIT, bob, permit2)
          planner.addCommand(CommandType.PERMIT2_PERMIT, [COMPLEX_SWAP_PERMIT, sig])
          gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          sig = await getPermitSignature(SIMPLE_SWAP_PERMIT, bob, permit2)
          planner.addCommand(CommandType.PERMIT2_PERMIT, [SIMPLE_SWAP_PERMIT, sig])
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)

          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        await snapshotGasCost(totalGas)
      })

      it('Permit2 Max Approval Swap', async () => {
        let totalGas = approvePermit2Gas
        let gasUsed: BigNumber

        // The first trade contains a max permit, all others contain no permit
        let sig = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, sig])

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)
          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP)
          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        await snapshotGasCost(totalGas)
      })
    })

    describe('Frequent Swapper across 3 swap router versions - 15 swaps across 3 versions', async () => {
      it('SwapRouter02', async () => {
        const { calldata: callDataComplex } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        const { calldata: callDataSimple } = SwapRouter.swapCallParameters(SIMPLE_SWAP, {
          slippageTolerance: new Percent(50, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        let totalGas = approveSwapRouter02Gas

        // Do 5 complex swaps on protocol 1
        for (let i = 0; i < 5; i++) {
          const tx = await executeSwapRouter02Swap({ value: '0', calldata: callDataComplex }, bob)
          totalGas = totalGas.add((await tx.wait()).gasUsed)
        }

        // Launch SwapRouter03
        const router2 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter
        const router2ApprovalTx = (await approveSwapRouter02(bob, USDC, router2.address))!
        totalGas = totalGas.add(router2ApprovalTx.gasUsed)

        // Do 5 simple swaps on SwapRouter03
        for (let i = 0; i < 5; i++) {
          const tx = await executeSwapRouter02Swap({ value: '0', calldata: callDataSimple }, bob)
          totalGas = totalGas.add((await tx.wait()).gasUsed)
        }

        // Launch SwapRouter04
        const router3 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter
        const router3ApprovalTx = (await approveSwapRouter02(bob, USDC, router3.address))!
        totalGas = totalGas.add(router3ApprovalTx.gasUsed)

        // Do 5 simple swaps on SwapRouter04
        for (let i = 0; i < 5; i++) {
          const tx = await executeSwapRouter02Swap({ value: '0', calldata: callDataSimple }, bob)
          totalGas = totalGas.add((await tx.wait()).gasUsed)
        }

        await snapshotGasCost(totalGas)
      })

      it('Permit2 Sign Per Swap', async () => {
        let totalGas = approvePermit2Gas
        let sig: string
        let gasUsed: BigNumber

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          sig = await getPermitSignature(COMPLEX_SWAP_PERMIT, bob, permit2)
          planner.addCommand(CommandType.PERMIT2_PERMIT, [COMPLEX_SWAP_PERMIT, sig])
          gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)

          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Launch Universal Router v2
        const router2 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          SIMPLE_SWAP_PERMIT.spender = router2.address
          sig = await getPermitSignature(SIMPLE_SWAP_PERMIT, bob, permit2)
          planner.addCommand(CommandType.PERMIT2_PERMIT, [SIMPLE_SWAP_PERMIT, sig])
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP, router2)

          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Launch Universal Router v3
        const router3 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          SIMPLE_SWAP_PERMIT.spender = router3.address
          sig = await getPermitSignature(SIMPLE_SWAP_PERMIT, bob, permit2)
          planner.addCommand(CommandType.PERMIT2_PERMIT, [SIMPLE_SWAP_PERMIT, sig])
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP, router3)

          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        await snapshotGasCost(totalGas)
      })

      it('Permit2 Max Approval Swap', async () => {
        let totalGas = approvePermit2Gas
        let gasUsed: BigNumber

        // The first trade contains a max permit, all others contain no permit
        let sig = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, sig])

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          gasUsed = await executeTradeUniversalRouter(planner, COMPLEX_SWAP)
          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Launch Universal Router v2
        const router2 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter
        MAX_PERMIT.spender = router2.address
        let calldata2 = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, calldata2])

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP, router2)
          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        // Launch Universal Router v3
        const router3 = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter
        MAX_PERMIT.spender = router3.address
        let calldata3 = await getPermitSignature(MAX_PERMIT, bob, permit2)
        planner.addCommand(CommandType.PERMIT2_PERMIT, [MAX_PERMIT, calldata3])

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          gasUsed = await executeTradeUniversalRouter(planner, SIMPLE_SWAP, router3)
          totalGas = totalGas.add(gasUsed)
          planner = new RoutePlanner()
        }

        await snapshotGasCost(totalGas)
      })
    })
  })

  function encodePathExactInput(route: IRoute<Token, Token, Pool | Pair>) {
    return encodePath(routeToAddresses(route))
  }

  function routeToAddresses(route: IRoute<Token, Token, Pool | Pair>) {
    const tokens = route.path
    return tokens.map((t) => t.address)
  }
})
