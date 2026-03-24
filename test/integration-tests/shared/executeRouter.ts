import { Contract, TransactionReceipt, BigNumberish } from 'ethers'
import { parseEvents, V2_EVENTS, V3_EVENTS } from './parseEvents'
import { UniversalRouter } from '../../../typechain'
import { DEADLINE } from './constants'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { RoutePlanner } from './planner'
import hre from 'hardhat'
const { ethers } = hre

type V2SwapEventArgs = {
  amount0In: bigint
  amount0Out: bigint
  amount1In: bigint
  amount1Out: bigint
}

type V3SwapEventArgs = {
  amount0: bigint
  amount1: bigint
}

type ExecutionParams = {
  wethBalanceBefore: bigint
  wethBalanceAfter: bigint
  daiBalanceBefore: bigint
  daiBalanceAfter: bigint
  usdcBalanceBefore: bigint
  usdcBalanceAfter: bigint
  ethBalanceBefore: bigint
  ethBalanceAfter: bigint
  v2SwapEventArgs: V2SwapEventArgs | undefined
  v3SwapEventArgs: V3SwapEventArgs | undefined
  receipt: TransactionReceipt
  gasSpent: bigint
}

export async function executeRouter(
  planner: RoutePlanner,
  caller: SignerWithAddress,
  router: UniversalRouter,
  wethContract: Contract,
  daiContract: Contract,
  usdcContract: Contract,
  value?: BigNumberish
): Promise<ExecutionParams> {
  const ethBalanceBefore: bigint = await ethers.provider.getBalance(caller.address)
  const wethBalanceBefore: bigint = await wethContract.balanceOf(caller.address)
  const daiBalanceBefore: bigint = await daiContract.balanceOf(caller.address)
  const usdcBalanceBefore: bigint = await usdcContract.balanceOf(caller.address)

  const { commands, inputs } = planner

  const receipt = await (
    await router.connect(caller)['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
  ).wait()
  const gasSpent = receipt!.gasUsed * receipt!.gasPrice
  const v2SwapEventArgs = parseEvents(V2_EVENTS, receipt!)[0]?.args as unknown as V2SwapEventArgs
  const v3SwapEventArgs = parseEvents(V3_EVENTS, receipt!)[0]?.args as unknown as V3SwapEventArgs

  const ethBalanceAfter: bigint = await ethers.provider.getBalance(caller.address)
  const wethBalanceAfter: bigint = await wethContract.balanceOf(caller.address)
  const daiBalanceAfter: bigint = await daiContract.balanceOf(caller.address)
  const usdcBalanceAfter: bigint = await usdcContract.balanceOf(caller.address)

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
    receipt: receipt!,
    gasSpent,
  }
}
