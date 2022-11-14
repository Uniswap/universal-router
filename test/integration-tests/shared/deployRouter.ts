import hre from 'hardhat'
const { ethers } = hre
import { Router, Permit2 } from '../../../typechain'
import { LOOKSRARE_REWARDS_DISTRIBUTOR, LOOKSRARE_TOKEN } from './constants'

export default async (
  permit2: Permit2,
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string
): Promise<Router> => {
  const testDeployBootstrapFactory = await ethers.getContractFactory('TestDeployBootstrap')
  const bootstrap = await testDeployBootstrapFactory.deploy(
    permit2.address,
    mockLooksRareRewardsDistributor ?? LOOKSRARE_REWARDS_DISTRIBUTOR,
    mockLooksRareToken ?? LOOKSRARE_TOKEN
  )

  const routerFactory = await ethers.getContractFactory('Router')
  const router = (await routerFactory.deploy(bootstrap.address)) as unknown as Router
  return router
}

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
  return permit2
}
