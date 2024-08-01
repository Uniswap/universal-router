import hre from 'hardhat'
const { ethers } = hre

import { PositionManager, PoolManager } from '../../../typechain'
import { DAI, USDC, WETH } from './mainnetForkHelpers'
import { ADDRESS_ZERO, FeeAmount } from '@uniswap/v3-sdk'
import { MAX_UINT160, ZERO_ADDRESS } from './constants'
import { Actions, V4Planner } from './v4Planner'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import { expandTo18Decimals } from './swapRouter02Helpers'
import { expandTo18DecimalsBN } from './helpers'

export const USDC_WETH_POOL_KEY = {
  currency0: USDC.address,
  currency1: WETH.address,
  fee: FeeAmount.LOW,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const USDC_WETH_PRICE = BigNumber.from('1282621508889261311518273674430423')
export const USDC_WETH_TICK_LOWER = 193800
export const USDC_WETH_TICK_UPPER = 193900

export const DAI_USDC_POOL_KEY = {
  currency0: DAI.address,
  currency1: USDC.address,
  fee: FeeAmount.LOWEST,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const DAI_USDC_PRICE = BigNumber.from('79227835492130174795940')
export const DAI_USDC_TICK_LOWER = -276330
export const DAI_USDC_TICK_UPPER = -276320

export const ETH_USDC_POOL_KEY = {
  currency0: ZERO_ADDRESS,
  currency1: USDC.address,
  fee: FeeAmount.LOW,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const ETH_USDC_PRICE = BigNumber.from('4899712312116710985145008')
export const ETH_USDC_TICK_UPPER = -193620
export const ETH_USDC_TICK_LOWER = -194040

export async function deployV4PositionManager(v4PoolManager: string, permit2: string): Promise<PositionManager> {
  const positionManagerFactory = await ethers.getContractFactory('PositionManager')
  const positionManager = (await positionManagerFactory.deploy(v4PoolManager, permit2)) as unknown as PositionManager
  return positionManager
}

export async function deployV4PoolManager(): Promise<PoolManager> {
  const poolManagerFactory = await ethers.getContractFactory('PoolManager')
  const poolManager = (await poolManagerFactory.deploy(500000)) as unknown as PoolManager
  return poolManager
}

export async function initializeV4Pool(poolManager: PoolManager, poolKey: any, sqrtPrice: BigNumber) {
  await poolManager.initialize(poolKey, sqrtPrice.toString(), '0x')
}

export async function addLiquidityToV4Pool(
  positionManager: PositionManager,
  poolKey: any,
  tickLower: number,
  tickUpper: number,
  liquidity: string,
  owner: SignerWithAddress
) {
  let v4Planner: V4Planner = new V4Planner()
  let positionConfig = {
    poolKey,
    tickLower,
    tickUpper,
  }
  v4Planner.addAction(Actions.MINT_POSITION, [positionConfig, liquidity, owner.address, '0x'])
  v4Planner.addAction(Actions.CLOSE_CURRENCY, [poolKey.currency0])
  v4Planner.addAction(Actions.CLOSE_CURRENCY, [poolKey.currency1])

  let value
  if (poolKey.currency0 == ADDRESS_ZERO) {
    value = expandTo18DecimalsBN(85)
    v4Planner.addAction(Actions.SWEEP, [ADDRESS_ZERO, owner.address])
  } else {
    value = 0
  }

  await positionManager.connect(owner).modifyLiquidities(v4Planner.finalize(), MAX_UINT160, { value })
}
