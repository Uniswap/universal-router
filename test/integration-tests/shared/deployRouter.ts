import hre from 'hardhat'
const { ethers } = hre
import { Router } from '../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  REWARDS_DISTRIBUTOR,
} from './constants'


export default async (): Promise<Router> => {
  const routerFactory = await ethers.getContractFactory('Router')
  const router = await routerFactory.deploy(
      ethers.constants.AddressZero,
      REWARDS_DISTRIBUTOR,
      V2_FACTORY_MAINNET,
      V3_FACTORY_MAINNET,
      V2_INIT_CODE_HASH_MAINNET,
      V3_INIT_CODE_HASH_MAINNET
    ) as Router
  return router
}
