import hre from 'hardhat'
const { ethers } = hre
import { UniversalRouter } from '../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  PERMIT2_ADDRESS,
  V3_NFT_POSITION_MANAGER_MAINNET,
  V4_POSITION_DESCRIPTOR_ADDRESS,
  WETH,
} from './constants'
import { deployV4PoolManager, deployV4PositionManager } from './v4Helpers'

export async function deployRouter(
  owner?: string,
  v4PoolManager?: string,
  mockReentrantWETH?: string
): Promise<UniversalRouter> {
  let poolManager: string

  if (v4PoolManager) {
    poolManager = v4PoolManager
  } else if (owner !== undefined) {
    poolManager = (await deployV4PoolManager(owner)).address
  } else {
    throw new Error('Either v4PoolManager must be set or owner must be provided')
  }
  const routerParameters = {
    permit2: PERMIT2_ADDRESS,
    weth9: mockReentrantWETH ?? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    v2Factory: V2_FACTORY_MAINNET,
    v3Factory: V3_FACTORY_MAINNET,
    pairInitCodeHash: V2_INIT_CODE_HASH_MAINNET,
    poolInitCodeHash: V3_INIT_CODE_HASH_MAINNET,
    v4PoolManager: poolManager,
    v3NFTPositionManager: V3_NFT_POSITION_MANAGER_MAINNET,
    v4PositionManager: (
      await deployV4PositionManager(poolManager, PERMIT2_ADDRESS, V4_POSITION_DESCRIPTOR_ADDRESS, WETH)
    ).address,
  }

  const routerFactory = await ethers.getContractFactory('UniversalRouter')
  const router = (await routerFactory.deploy(routerParameters)) as unknown as UniversalRouter
  return router
}

export default deployRouter
