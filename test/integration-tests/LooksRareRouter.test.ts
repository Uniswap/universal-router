import { RouterPlanner, LooksRareCommand } from '@uniswap/narwhal-sdk'
import { Router, ERC721 } from '../../typechain'
import LOOKS_RARE_ABI from './shared/abis/LooksRare.json'
import { resetFork, COVEN_NFT } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre
import { BigNumber } from 'ethers'
import fs from 'fs'

const looksRareOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/LooksRare.json', { encoding: 'utf8' })
)

type APIOrder = Omit<MakerOrder, 'collection' | 'currency'> & {
  collectionAddress: string
  currencyAddress: string
}

type MakerOrder = {
  collection: string
  tokenId: BigNumber
  isOrderAsk: true
  signer: string
  strategy: string
  currency: string
  amount: BigNumber
  price: BigNumber
  minPercentageToAsk: BigNumber
  nonce: BigNumber
  startTime: BigNumber
  endTime: BigNumber
  v: BigNumber
  r: string
  s: string
  params: string
}

type TakerOrder = {
  minPercentageToAsk: BigNumber
  price: BigNumber
  taker: string
  tokenId: BigNumber
  isOrderAsk: boolean
  params: string
}

function createLooksRareOrders(
  apiOrder: APIOrder,
  taker: string
): { makerOrder: MakerOrder; takerOrder: TakerOrder; value: BigNumber } {
  const collection = apiOrder.collectionAddress
  const currency = apiOrder.currencyAddress
  if (apiOrder.params == '') apiOrder.params = '0x'

  const makerOrder = { ...apiOrder, collection, currency }

  const takerOrder = {
    minPercentageToAsk: apiOrder.minPercentageToAsk,
    price: apiOrder.price,
    taker,
    tokenId: apiOrder.tokenId,
    isOrderAsk: false,
    params: apiOrder.params,
  }

  const value = BigNumber.from(apiOrder.price)

  return { makerOrder, takerOrder, value }
}

describe('LooksRare', () => {
  let alice: SignerWithAddress
  let router: Router
  let value: BigNumber
  let planner: RouterPlanner
  let covenContract: ERC721
  let takerOrder: TakerOrder
  let makerOrder: MakerOrder
  let tokenId: BigNumber

  const looksRareInterface = new ethers.utils.Interface(LOOKS_RARE_ABI)

  beforeEach(async () => {
    await resetFork()

    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = COVEN_NFT.connect(alice)

    const routerFactory = await ethers.getContractFactory('Router')
    router = (
      await routerFactory.deploy(
        ethers.constants.AddressZero,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
    planner = new RouterPlanner()
    ;({ makerOrder, takerOrder, value } = createLooksRareOrders(looksRareOrders[0], router.address))
    tokenId = makerOrder.tokenId
  })

  it('Buy a Coven', async () => {
    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder,
      makerOrder,
    ])

    planner.add(LooksRareCommand(value, calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId))
    const { commands, state } = planner.plan()
    await router.execute(DEADLINE, commands, state, { value: value })

    await expect((await covenContract.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
  })

  it('gas: buy 1 NFT on looks rare', async () => {
    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder,
      makerOrder,
    ])

    planner.add(LooksRareCommand(value.toString(), calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId))
    const { commands, state } = planner.plan()

    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })
})
