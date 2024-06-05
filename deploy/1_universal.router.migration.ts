import { Deployer, Reporter } from '@solarity/hardhat-migrate'

import { Permit2__factory, UniversalRouter__factory } from '../typechain'

import config from './default.config.json'

interface Config {
  permit2: string
  weth9: string
  steth: string
  wsteth: string
  seaportV1_5: string
  seaportV1_4: string
  openseaConduit: string
  nftxZap: string
  x2y2: string
  foundation: string
  sudoswap: string
  elementMarket: string
  nft20Zap: string
  cryptopunks: string
  looksRareV2: string
  routerRewardsDistributor: string
  looksRareRewardsDistributor: string
  looksRareToken: string
  v2Factory: string
  v3Factory: string
  pairInitCodeHash: string
  poolInitCodeHash: string
}

export = async (deployer: Deployer) => {
  let exportedConfig = config as Config

  exportedConfig.weth9 = process.env.WETH9_ADDRESS!
  exportedConfig.v3Factory = process.env.V3_FACTORY_ADDRESS!

  if (!await isContract(deployer, exportedConfig.permit2)) {
    const permit = await deployer.deploy(Permit2__factory)
    exportedConfig.permit2 = permit.address

    console.log(`Permit2 deployed at ${permit.address}`)
  }

  const universalRouter = await deployer.deploy(UniversalRouter__factory, [exportedConfig])

  Reporter.reportContracts(['UniversalRouter', universalRouter.address])
}

async function isContract(deployer: Deployer, address: string) {
  const signer = await deployer.getSigner()

  const code = await signer.provider!.getCode(address)

  return code !== '0x'
}