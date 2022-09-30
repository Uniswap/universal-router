import { RouterPlanner, LooksRareCommand } from '@uniswap/narwhal-sdk'
import { Router, ERC721, ERC1155 } from '../../typechain'
import LOOKS_RARE_ABI from './shared/abis/LooksRare.json'
import { resetFork, COVEN_NFT_721, TWERKY_NFT_1155 } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  TWERKY_ADDRESS,
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
const looksRareInterface = new ethers.utils.Interface(LOOKS_RARE_ABI)

const ERC_721_ORDER_INDEX = 0
const ERC_1155_ORDER_INDEX = 2

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
  let twerkyContract: ERC1155

  beforeEach(async () => {
    await resetFork()
    covenContract = COVEN_NFT_721.connect(alice)
    twerkyContract = TWERKY_NFT_1155.connect(alice)

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

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
  })

  describe('ERC-721 Purchase', () => {
    let takerOrder: TakerOrder
    let makerOrder: MakerOrder
    let tokenId: BigNumber

    beforeEach(async () => {
      ;({ makerOrder, takerOrder, value } = createLooksRareOrders(looksRareOrders[ERC_721_ORDER_INDEX], router.address))
      tokenId = makerOrder.tokenId
    })

    it('Buys a Coven', async () => {
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.add(LooksRareCommand(value, calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId, 0))
      const { commands, state } = planner.plan()
      await router.execute(DEADLINE, commands, state, { value: value })

      await expect((await covenContract.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })

    it('gas: buy 1 ERC-721 on looks rare', async () => {
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.add(LooksRareCommand(value.toString(), calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId, 0))
      const { commands, state } = planner.plan()

      await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
    })
  })

  describe('ERC-1155 Purchase', () => {
    let takerOrder: TakerOrder
    let makerOrder: MakerOrder
    let tokenId: BigNumber
    let value: BigNumber
    let commands: string
    let state: string[]

    beforeEach(async () => {
      ;({ makerOrder, takerOrder, value } = createLooksRareOrders(
        looksRareOrders[ERC_1155_ORDER_INDEX],
        router.address
      ))
      tokenId = makerOrder.tokenId
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])
      planner.add(LooksRareCommand(value, calldata, ALICE_ADDRESS, TWERKY_ADDRESS, tokenId, 1))
      ;({ commands, state } = planner.plan())
    })

    it('Buys a Twerky', async () => {
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(0)
      await router.execute(DEADLINE, commands, state, { value: value })
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(1)
    })

    it('gas: buy 1 ERC-1155 on looks rare', async () => {
      await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
    })
  })
})
