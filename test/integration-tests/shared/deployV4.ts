import hre from 'hardhat'
const { ethers } = hre

import { PositionManager, PoolManager } from '../../../typechain'

export async function deployV4PositionManager(poolManager: string, permit2: string): Promise<string> {
  const positionManagerFactory = await ethers.getContractFactory('PositionManager')
  const positionManager = (await positionManagerFactory.deploy(poolManager, permit2)) as unknown as PositionManager
  return positionManager.address
}

export async function deployV4PoolManager(): Promise<string> {
  const poolManagerFactory = await ethers.getContractFactory('PoolManager')
  const poolManager = (await poolManagerFactory.deploy(500000)) as unknown as PoolManager
  return poolManager.address
}
