import hre from 'hardhat'
const { ethers } = hre
import { Router, Permit2 } from '../../../typechain'
import { LOOKSRARE_REWARDS_DISTRIBUTOR, LOOKSRARE_TOKEN } from './constants'

export async function deployRouter(
  permit2: Permit2,
  mockLooksRareRewardsDistributor?: string,
  mockLooksRareToken?: string
): Promise<Router> {
  const routerParameters = {
    permit2: permit2.address,
    weth9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    seaport: '0x00000000006c3852cbEf3e08E8dF289169EdE581',
    nftxZap: '0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d',
    x2y2: '0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3',
    foundation: '0xcDA72070E455bb31C7690a170224Ce43623d0B6f',
    sudoswap: '0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329',
    nft20Zap: '0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0',
    cryptopunks: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
    looksRare: '0x59728544B08AB483533076417FbBB2fD0B17CE3a',
    routerRewardsDistributor: '0xea37093ce161f090e443f304e1bF3a8f14D7bb40',
    looksRareRewardsDistributor: mockLooksRareRewardsDistributor ?? LOOKSRARE_REWARDS_DISTRIBUTOR,
    looksRareToken: mockLooksRareToken ?? LOOKSRARE_TOKEN,
    v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    pairInitCodeHash: '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f',
    poolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
  }

  const routerFactory = await ethers.getContractFactory('Router')
  const router = (await routerFactory.deploy(routerParameters)) as unknown as Router
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
): Promise<[Router, Permit2]> {
  const permit2 = await deployPermit2()
  const router = await deployRouter(permit2, mockLooksRareRewardsDistributor, mockLooksRareToken)
  return [router, permit2]
}
