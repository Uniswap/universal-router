import hre from 'hardhat'
const { ethers } = hre

import { PositionManager, PoolManager } from '../../../typechain'
import { DAI, USDC, WETH } from './mainnetForkHelpers'
import { FeeAmount } from '@uniswap/v3-sdk'
import { ZERO_ADDRESS } from './constants'

export const USDC_WETH_POOL_KEY = {
  currency0: USDC.address,
  currency1: WETH.address,
  fee: FeeAmount.LOW,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const DAI_USDC_POOL_KEY = {
  currency0: DAI.address,
  currency1: USDC.address,
  fee: FeeAmount.LOWEST,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const ETH_USDC_POOL_KEY = {
  currency0: ZERO_ADDRESS,
  currency1: USDC.address,
  fee: FeeAmount.LOW,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
}

export const SQRT_PRICE_1_1 = 79228162514264337593543950336

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

export async function initializeV4Pools(poolManager: PoolManager) {
  await poolManager.initialize(DAI_USDC_POOL_KEY, SQRT_PRICE_1_1, '0x')
  await poolManager.initialize(USDC_WETH_POOL_KEY, SQRT_PRICE_1_1, '0x')
  await poolManager.initialize(ETH_USDC_POOL_KEY, SQRT_PRICE_1_1, '0x')
}
