import { encodeSqrtRatioX96, FeeAmount, Pool, TickMath } from '@uniswap/v3-sdk'
import { Pair, Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { encodePath, expandTo18Decimals } from '../shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { SwapRouter } from '@uniswap/router-sdk'
import {
  executeSwapRouter02Swap,
  resetFork,
  WETH,
  DAI,
  USDC,
  USDT,
  approveSwapRouter02,
} from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MAX_UINT, MAX_UINT160 } from '../shared/constants'
import { expandTo6DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import hre from 'hardhat'
import { Router, Permit2, ERC20__factory, ERC20 } from '../../../typechain'
import { signPermitAndConstructCalldata, Permit } from '../shared/protocolHelpers/permit2'
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { IRoute, Trade } from '@uniswap/router-sdk'
const { ethers } = hre

describe.only('Uniswap UX Tests Narwhal:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let usdcContract: ERC20
  let planner: RoutePlanner

  let SIMPLE_SWAP: Trade<Token, Token, TradeType.EXACT_INPUT>
  let COMPLEX_SWAP: Trade<Token, Token, TradeType.EXACT_INPUT>
  let MAX_PERMIT: Permit
  let SIMPLE_SWAP_PERMIT: Permit
  let COMPLEX_SWAP_PERMIT: Permit

  let MSG_SENDER: boolean = true

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    usdcContract = ERC20__factory.connect(USDC.address, alice)

    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployRouter(permit2)).connect(bob) as Router
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

    const createPool = (tokenA: Token, tokenB: Token, fee: FeeAmount) => {
      return new Pool(tokenA, tokenB, fee, sqrtRatioX96, 1_000_000, TickMath.getTickAtSqrtRatio(sqrtRatioX96))
    }

    const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
    const USDC_WETH = createPool(USDC, WETH, FeeAmount.HIGH)
    const DAI_WETH = createPool(DAI, WETH, FeeAmount.HIGH)
    const USDC_USDT = createPool(USDC, USDT, FeeAmount.LOWEST)
    const USDT_DAI = createPool(DAI, USDT, FeeAmount.LOWEST)

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
          routev3: new V3RouteSDK([USDC_WETH, DAI_WETH], USDC, DAI),
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
          routev3: new V3RouteSDK([USDC_WETH, DAI_WETH], USDC, DAI),
          inputAmount: complexSwapAmountInSplit1,
          outputAmount: CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(3000)),
        },
        {
          routev3: new V3RouteSDK([USDC_USDT, USDT_DAI], USDC, DAI),
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
      token: COMPLEX_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(MAX_UINT160),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }

    SIMPLE_SWAP_PERMIT = {
      token: SIMPLE_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(SIMPLE_SWAP.inputAmount.quotient.toString()),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }

    COMPLEX_SWAP_PERMIT = {
      token: COMPLEX_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(COMPLEX_SWAP.inputAmount.quotient.toString()),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }
    COMPLEX_SWAP_PERMIT
  })

  describe('Narwhal Estimates', async () => {
    describe('Approvals', async () => {
      it('Cost for infinite approval of permit2/swaprouter02 contract', async () => {
        // Bob max-approves the permit2 contract to access his DAI and WETH
        await snapshotGasCost(await usdcContract.approve(permit2.address, MAX_UINT))
      })
    })
  })

  describe('Comparisons', async () => {
    let approvePermit2Gas: BigNumber
    let approveSwapRouter02Gas: BigNumber

    beforeEach(async () => {
      // bob has already given his infinite approval of USDC to permit2
      const permitApprovalTx = await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
      approvePermit2Gas = (await permitApprovalTx.wait()).gasUsed

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
        const calldata = await signPermitAndConstructCalldata(SIMPLE_SWAP_PERMIT, bob, permit2.address)
        const path = encodePathExactInput(SIMPLE_SWAP.routes[0])

        planner.addCommand(CommandType.PERMIT2_PERMIT, [calldata])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [bob.address, SIMPLE_SWAP_PERMIT.amount, 0, path, MSG_SENDER])

        const { commands, inputs } = planner

        const tx = await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const gasUsed = (await tx.wait()).gasUsed

        await snapshotGasCost(approvePermit2Gas.add(gasUsed))
      })

      it('Permit2 Max Approval Swap', async () => {
        const calldata = await signPermitAndConstructCalldata(MAX_PERMIT, bob, permit2.address)
        const path = encodePathExactInput(SIMPLE_SWAP.routes[0])

        planner.addCommand(CommandType.PERMIT2_PERMIT, [calldata])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [bob.address, SIMPLE_SWAP_PERMIT.amount, 0, path, MSG_SENDER])

        const { commands, inputs } = planner
        const tx = await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const gasUsed = (await tx.wait()).gasUsed

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
        return
      })
      it('Permit2 Max Approval Swap', async () => {
        return
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

        let totalGas = BigNumber.from(0)

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
        return
      })

      it('Permit2 Max Approval Swap', async () => {
        return
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

        let totalGas = BigNumber.from(0)

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
        return
      })

      it('Permit2 Max Approval Swap', async () => {
        return
      })
    })
  })

  function encodePathExactInput(route: IRoute<Token, Token, Pool | Pair>) {
    const tokens = route.path
    return encodePath(
      tokens.map((t) => t.address),
      new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)
    )
  }

  // function encodePathExactOutput(tokens: Token[]) {
  //   return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  // }
})
