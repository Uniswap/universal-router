import type { Contract } from '@ethersproject/contracts'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { Pair } from '@uniswap/v2-sdk'
import { FeeAmount } from '@uniswap/v3-sdk'
import { parseEvents, V2_EVENTS, V3_EVENTS } from './shared/parseEvents'
import { expect } from './shared/expect'
import { makePair, encodePath } from './shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { Permit2, Router } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, USDT } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, CONTRACT_BALANCE, DEADLINE, MAX_UINT, MAX_UINT160, ONE_PERCENT_BIPS } from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployRouter, { deployPermit2 } from './shared/deployRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { signPermitAndConstructCalldata, Permit } from './shared/protocolHelpers/permit2'
import { Token } from '@uniswap/sdk-core'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
const { ethers } = hre

describe.only('Uniswap UX Tests Narwhal:', () => {
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

  let MSG_SENDER: boolean = true
  let ROUTER: boolean = false

  type Swap = {
    path: Token[]
    amountIn: BigNumber
  }

  const simpleSwap: Swap = {
    path: [USDC, WETH, DAI],
    amountIn: expandTo6DecimalsBN(1000)
  }

  const complexSwapPart1: Swap = {
    path: [USDC, WETH, DAI],
    amountIn: expandTo6DecimalsBN(30000)
  }

  const complexSwapPart2: Swap = {
    path: [USDC, USDT, DAI],
    amountIn: expandTo6DecimalsBN(40000)
  }

  const complexSwapPart3: Swap = {
    path: [USDC, DAI],
    amountIn: expandTo6DecimalsBN(30000)
  }

  const complexSwap: Swap[] = [complexSwapPart1, complexSwapPart2, complexSwapPart3]

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
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployRouter(permit2)).connect(bob) as Router
    pair_DAI_WETH = await makePair(bob, DAI, WETH)
    pair_DAI_USDC = await makePair(bob, DAI, USDC)
    planner = new RoutePlanner()

    // alice gives bob some tokens
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(10000000))
  })

  describe('Narwhal Estimates', async () => {
    describe('Approvals', async () => {
      it('Cost for infinite approval of permit2 contract', async () => {
        // Bob max-approves the permit2 contract to access his DAI and WETH
        await snapshotGasCost(await usdcContract.approve(permit2.address, MAX_UINT))
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
    const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(bob.address)
    const wethBalanceBefore: BigNumber = await wethContract.balanceOf(bob.address)
    const daiBalanceBefore: BigNumber = await daiContract.balanceOf(bob.address)
    const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)

    const { commands, inputs } = planner

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const v2SwapEventArgs = parseEvents(V2_EVENTS, receipt)[0]?.args as unknown as V2SwapEventArgs
    const v3SwapEventArgs = parseEvents(V3_EVENTS, receipt)[0]?.args as unknown as V3SwapEventArgs

    const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(bob.address)
    const wethBalanceAfter: BigNumber = await wethContract.balanceOf(bob.address)
    const daiBalanceAfter: BigNumber = await daiContract.balanceOf(bob.address)
    const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

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
