import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { FeeAmount, Pool } from '@uniswap/v3-sdk'
import { Pair, Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { encodePath } from '../shared/swapRouter02Helpers'
import { BigNumber } from 'ethers'
import { SwapRouter } from '@uniswap/router-sdk'
import { executeSwap as executeSwapRouter02Swap, resetFork, WETH, DAI, USDC, USDT } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MAX_UINT } from '../shared/constants'
import { expandTo6DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import hre from 'hardhat'
import { Router, Permit2, ERC20__factory, ERC20 } from '../../../typechain'
import { signPermitAndConstructCalldata, Permit } from '../shared/protocolHelpers/permit2'
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { UniswapMulticallProvider, V3PoolProvider, ChainId, V2PoolProvider } from '@uniswap/smart-order-router'
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
  let ROUTER: boolean = false

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
    await usdcContract.connect(alice.address).transfer(bob.address, expandTo6DecimalsBN(10000000))

    /*
      Simple Swap =
      1000 USDC —V3→ ETH —V3→ DAI

      Complex Swap =
      30000 USDC —V3—> ETH — V3—> DAI
      40000 USDC —V3—> USDT —V3—>DAI
      30000 USDC —V2—> DAI
    */
    const multicall2Provider = new UniswapMulticallProvider(ChainId.MAINNET, ethers.provider as any)

    const v3PoolProvider = new V3PoolProvider(ChainId.MAINNET, multicall2Provider)
    const v3PoolAccessor = await v3PoolProvider.getPools([
      [USDC, WETH, FeeAmount.HIGH],
      [DAI, WETH, FeeAmount.HIGH],
      [USDC, USDT, FeeAmount.LOWEST],
      [USDT, DAI, FeeAmount.LOWEST],
    ])
    const USDC_WETH = v3PoolAccessor.getPool(USDC, WETH, FeeAmount.HIGH)!
    const DAI_WETH = v3PoolAccessor.getPool(DAI, WETH, FeeAmount.HIGH)!
    const USDC_USDT = v3PoolAccessor.getPool(USDC, USDT, FeeAmount.LOWEST)!
    const USDT_DAI = v3PoolAccessor.getPool(USDT, DAI, FeeAmount.LOWEST)!

    const v2PoolProvider = new V2PoolProvider(ChainId.MAINNET, multicall2Provider)
    const v2PoolAccessor = await v2PoolProvider.getPools([[USDC, DAI]])
    const USDC_DAI_V2 = v2PoolAccessor.getPool(USDC, DAI)!

    const simpleSwapAmountInUSDC = CurrencyAmount.fromRawAmount(USDC, 1000)
    const complexSwapAmountInSplit1 = CurrencyAmount.fromRawAmount(USDC, 30000)
    const complexSwapAmountInSplit2 = CurrencyAmount.fromRawAmount(USDC, 40000)
    const complexSwapAmountInSplit3 = CurrencyAmount.fromRawAmount(USDC, 30000)

    SIMPLE_SWAP = await Trade.fromRoute(
      new V3RouteSDK([USDC_WETH, DAI_WETH], USDC, DAI),
      simpleSwapAmountInUSDC,
      TradeType.EXACT_INPUT
    )

    COMPLEX_SWAP = await Trade.fromRoutes(
      [{ routev2: new V2RouteSDK([USDC_DAI_V2], USDC, DAI), amount: complexSwapAmountInSplit3 }],
      [
        { routev3: new V3RouteSDK([USDC_WETH, DAI_WETH], USDC, DAI), amount: complexSwapAmountInSplit1 },
        { routev3: new V3RouteSDK([USDC_USDT, USDT_DAI], USDC, DAI), amount: complexSwapAmountInSplit2 },
      ],
      TradeType.EXACT_INPUT
    )

    MAX_PERMIT = {
      token: COMPLEX_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(MAX_UINT),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }

    SIMPLE_SWAP_PERMIT = {
      token: SIMPLE_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(SIMPLE_SWAP.inputAmount.quotient),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }

    COMPLEX_SWAP_PERMIT = {
      token: COMPLEX_SWAP.inputAmount.currency.address,
      spender: router.address,
      amount: BigNumber.from(COMPLEX_SWAP.inputAmount.quotient),
      expiration: 0, // expiration of 0 is block.timestamp
      nonce: 0, // this is his first trade
      sigDeadline: DEADLINE,
    }
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
    beforeEach(async () => {
      // bob has already given his infinite approval of USDC to permit2
      await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
    })

    describe('One Time Swapper - Simple Swap', async () => {
      it('SwapRouter02', async () => {
        const { calldata } = SwapRouter.swapCallParameters(SIMPLE_SWAP, {
          slippageTolerance: new Percent(10, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(
          executeSwapRouter02Swap(
            { value: '0', calldata },
            SIMPLE_SWAP.inputAmount.currency,
            SIMPLE_SWAP.outputAmount.currency,
            bob
          )
        )
      })

      it('Permit2 Sign Per Swap', async () => {
        const calldata = await signPermitAndConstructCalldata(SIMPLE_SWAP_PERMIT, bob, permit2.address)
        const path = encodePathExactInput(SIMPLE_SWAP.routes[0])

        planner.addCommand(CommandType.PERMIT2_PERMIT, [calldata])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [bob.address, SIMPLE_SWAP_PERMIT.amount, 0, path, MSG_SENDER])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })

      it('Permit2 Max Approval Swap', async () => {
        const calldata = await signPermitAndConstructCalldata(MAX_PERMIT, bob, permit2.address)
        const path = encodePathExactInput(SIMPLE_SWAP.routes[0])

        planner.addCommand(CommandType.PERMIT2_PERMIT, [calldata])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [bob.address, SIMPLE_SWAP_PERMIT.amount, 0, path, MSG_SENDER])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })

    describe('One Time Swapper - Complex Swap', async () => {
      it('SwapRouter02', async () => {
        const { calldata } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(10, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        await snapshotGasCost(
          executeSwapRouter02Swap(
            { value: '0', calldata },
            COMPLEX_SWAP.inputAmount.currency,
            COMPLEX_SWAP.outputAmount.currency,
            bob
          )
        )
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
        const { calldata } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(10, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        // Swap 1 (complex)
        await executeSwapRouter02Swap(
          { value: '0', calldata },
          COMPLEX_SWAP.inputAmount.currency,
          COMPLEX_SWAP.outputAmount.currency,
          bob
        )

        // Swap 2 (complex)
        await executeSwapRouter02Swap(
          { value: '0', calldata },
          COMPLEX_SWAP.inputAmount.currency,
          COMPLEX_SWAP.outputAmount.currency,
          bob
        )

        // Swap 3 (simple)
        await executeSwapRouter02Swap(
          { value: '0', calldata },
          SIMPLE_SWAP.inputAmount.currency,
          SIMPLE_SWAP.outputAmount.currency,
          bob
        )
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
        const { calldata } = SwapRouter.swapCallParameters(COMPLEX_SWAP, {
          slippageTolerance: new Percent(10, 100),
          recipient: bob.address,
          deadlineOrPreviousBlockhash: DEADLINE,
        })

        // Do 5 complex swaps
        for (let i = 0; i < 5; i++) {
          await executeSwapRouter02Swap(
            { value: '0', calldata },
            COMPLEX_SWAP.inputAmount.currency,
            COMPLEX_SWAP.outputAmount.currency,
            bob
          )
        }

        // Do 5 simple swaps
        for (let i = 0; i < 5; i++) {
          await executeSwapRouter02Swap(
            { value: '0', calldata },
            SIMPLE_SWAP.inputAmount.currency,
            SIMPLE_SWAP.outputAmount.currency,
            bob
          )
        }
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
