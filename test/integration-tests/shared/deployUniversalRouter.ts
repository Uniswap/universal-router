import hre from 'hardhat'
const { ethers } = hre
import { UniversalRouter, Permit2 } from '../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  ROUTER_REWARDS_DISTRIBUTOR,
  LOOKSRARE_REWARDS_DISTRIBUTOR,
  LOOKSRARE_TOKEN,
} from './constants'

export async function deployRouter(
  permit2: Permit2,
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string,
  mockReentrantProtocol?: string
): Promise<UniversalRouter> {
  const routerParameters = {
    permit2: permit2.address,
    weth9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    seaport: '0x00000000006c3852cbEf3e08E8dF289169EdE581',
    nftxZap: mockReentrantProtocol ?? '0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d',
    x2y2: '0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3',
    foundation: '0xcDA72070E455bb31C7690a170224Ce43623d0B6f',
    sudoswap: '0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329',
    nft20Zap: '0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0',
    cryptopunks: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
    looksRare: '0x59728544B08AB483533076417FbBB2fD0B17CE3a',
    routerRewardsDistributor: ROUTER_REWARDS_DISTRIBUTOR,
    looksRareRewardsDistributor: mockLooksRareRewardsDistributor ?? LOOKSRARE_REWARDS_DISTRIBUTOR,
    looksRareToken: mockLooksRareToken ?? LOOKSRARE_TOKEN,
    v2Factory: V2_FACTORY_MAINNET,
    v3Factory: V3_FACTORY_MAINNET,
    pairInitCodeHash: V2_INIT_CODE_HASH_MAINNET,
    poolInitCodeHash: V3_INIT_CODE_HASH_MAINNET,
  }

  const routerFactory = await ethers.getContractFactory('UniversalRouter')
  const router = (await routerFactory.deploy(routerParameters)) as unknown as UniversalRouter
  return router
}

export default deployRouter

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
  return permit2
}

export async function deployRouterAndPermit2(
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string
): Promise<[UniversalRouter, Permit2]> {
  const permit2 = await deployPermit2()
  const router = await deployRouter(permit2, mockLooksRareRewardsDistributor, mockLooksRareToken)
  return [router, permit2]
}
