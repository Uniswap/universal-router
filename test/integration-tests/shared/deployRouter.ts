import hre from 'hardhat'
const { ethers } = hre
import { Router } from '../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  ROUTER_REWARDS_DISTRIBUTOR,
  LOOKSRARE_REWARDS_DISTRIBUTOR,
  LOOKSRARE_TOKEN,
} from './constants'

export default async (mockLooksRareRewardsDistributor?: string, mockLooksRareToken?: string): Promise<Router> => {
  const routerFactory = await ethers.getContractFactory('Router')
  const router = (await routerFactory.deploy(
    ethers.constants.AddressZero,
    ROUTER_REWARDS_DISTRIBUTOR,
    mockLooksRareRewardsDistributor ?? LOOKSRARE_REWARDS_DISTRIBUTOR,
    mockLooksRareToken ?? LOOKSRARE_TOKEN,
    V2_FACTORY_MAINNET,
    V3_FACTORY_MAINNET,
    V2_INIT_CODE_HASH_MAINNET,
    V3_INIT_CODE_HASH_MAINNET
  )) as Router
  return router
}
