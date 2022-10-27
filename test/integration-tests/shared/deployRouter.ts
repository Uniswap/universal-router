import hre from 'hardhat'
const { ethers } = hre
import { Router, Permit2 } from '../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './constants'

export default async (permit2: Permit2): Promise<Router> => {
  const routerFactory = await ethers.getContractFactory('Router')
  const router = (await routerFactory.deploy(
    permit2.address,
    V2_FACTORY_MAINNET,
    V3_FACTORY_MAINNET,
    V2_INIT_CODE_HASH_MAINNET,
    V3_INIT_CODE_HASH_MAINNET
  )) as unknown as Router
  return router
}

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
  return permit2
}
