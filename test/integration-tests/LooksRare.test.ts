import { CommandType, RoutePlanner } from './shared/planner'
import { UniversalRouter, Permit2, ERC721, ERC1155 } from '../../typechain'
import { resetFork, COVEN_721, TWERKY_1155, DRAGON_721 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, TWERKY_ADDRESS, DEADLINE } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre
import { BigNumber } from 'ethers'
import {
  createLooksRareOrders,
  looksRareInterface,
  looksRareOrders,
  LOOKS_RARE_1155_ORDER,
  LOOKS_RARE_721_ORDER,
  MakerOrder,
  TakerOrder,
} from './shared/protocolHelpers/looksRare'
import { looksRareV2Interface, looksRareV2Orders, LRv2BuyOrder } from './shared/protocolHelpers/looksRareV2'

describe('LooksRare', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let value: BigNumber
  let planner: RoutePlanner
  let cryptoCovens: ERC721
  let twerkyContract: ERC1155

  beforeEach(async () => {
    await resetFork()
    cryptoCovens = COVEN_721.connect(alice)
    twerkyContract = TWERKY_1155.connect(alice)

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  describe('ERC-721 Purchase', () => {
    let takerOrder: TakerOrder
    let makerOrder: MakerOrder
    let tokenId: BigNumber

    beforeEach(async () => {
      ;({ makerOrder, takerOrder, value } = createLooksRareOrders(
        looksRareOrders[LOOKS_RARE_721_ORDER],
        router.address
      ))
      tokenId = makerOrder.tokenId
    })

    it('Buys a Coven', async () => {
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.addCommand(CommandType.LOOKS_RARE_721, [value, calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId])
      const { commands, inputs } = planner

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })

      await expect((await cryptoCovens.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })

  describe('ERC-1155 Purchase', () => {
    let takerOrder: TakerOrder
    let makerOrder: MakerOrder
    let tokenId: BigNumber
    let value: BigNumber
    let commands: string
    let inputs: string[]

    beforeEach(async () => {
      ;({ makerOrder, takerOrder, value } = createLooksRareOrders(
        looksRareOrders[LOOKS_RARE_1155_ORDER],
        router.address
      ))
      tokenId = makerOrder.tokenId
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])
      planner.addCommand(CommandType.LOOKS_RARE_1155, [value, calldata, ALICE_ADDRESS, TWERKY_ADDRESS, tokenId, 1])
      ;({ commands, inputs } = planner)
    })

    it('Buys a Twerky', async () => {
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(0)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(1)
    })
  })
})

describe('LooksRareV2', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let value: BigNumber
  let planner: RoutePlanner
  let dragonNFT: ERC721
  let order: LRv2BuyOrder
  let tokenId: number

  beforeEach(async () => {
    await resetFork(17030829)
    dragonNFT = DRAGON_721.connect(alice)

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  it('Buys a Dragon', async () => {
    order = looksRareV2Orders[0]
    value = BigNumber.from(order.makerAsk.price)
    tokenId = order.makerAsk.itemIds[0]
    order.takerBid.recipient = alice.address

    const calldata = looksRareV2Interface.encodeFunctionData('executeTakerBid', [
      order.takerBid,
      order.makerAsk,
      order.makerSignature,
      order.merkleTree,
      order.affiliate,
    ])
    planner.addCommand(CommandType.LOOKS_RARE_V2, [value, calldata])

    const { commands, inputs } = planner

    await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).not.to.eq(ALICE_ADDRESS)

    await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
    await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
  })
})
