import type { Contract } from '@ethersproject/contracts'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { parseEvents, V2_EVENTS, V3_EVENTS } from './parseEvents'
import { BigNumber, BigNumberish } from 'ethers'
import { UniversalRouter } from '../../../typechain'
import { DEADLINE } from './constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { RoutePlanner } from './planner'
import hre from 'hardhat'
const { ethers } = hre

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

export async function executeRouter(
  planner: RoutePlanner,
  caller: SignerWithAddress,
  router: UniversalRouter,
  wethContract: Contract,
  daiContract: Contract,
  usdcContract: Contract,
  value?: BigNumberish
): Promise<ExecutionParams> {
  const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(caller.address)
  const wethBalanceBefore: BigNumber = await wethContract.balanceOf(caller.address)
  const daiBalanceBefore: BigNumber = await daiContract.balanceOf(caller.address)
  const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(caller.address)

  const { commands, inputs } = planner

  const receipt = await (
    await router.connect(caller)['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
  ).wait()
  const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
  const v2SwapEventArgs = parseEvents(V2_EVENTS, receipt)[0]?.args as unknown as V2SwapEventArgs
  const v3SwapEventArgs = parseEvents(V3_EVENTS, receipt)[0]?.args as unknown as V3SwapEventArgs

  const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(caller.address)
  const wethBalanceAfter: BigNumber = await wethContract.balanceOf(caller.address)
  const daiBalanceAfter: BigNumber = await daiContract.balanceOf(caller.address)
  const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(caller.address)

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
