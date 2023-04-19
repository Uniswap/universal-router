import { CommandType, RoutePlanner } from './shared/planner'
import { UniversalRouter, Permit2, ERC721 } from '../../typechain'
import { resetFork, DRAGON_721 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ZERO_ADDRESS } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre
import {
  createLooksRareV2Order,
  createLooksRareV2Orders,
  looksRareV2Interface,
  looksRareV2Orders,
  LRV2APIOrder,
} from './shared/protocolHelpers/looksRareV2'

describe('LooksRareV2', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let dragonNFT: ERC721
  let order: LRV2APIOrder
  let order2: LRV2APIOrder

  describe('Single Buy', () => {
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
      const { takerBid, makerOrder, makerSignature, value, merkleTree } = createLooksRareV2Order(order, alice.address)
      const tokenId = makerOrder.itemIds[0]
      const calldata = looksRareV2Interface.encodeFunctionData('executeTakerBid', [
        takerBid,
        makerOrder,
        makerSignature,
        merkleTree,
        ZERO_ADDRESS,
      ])
      planner.addCommand(CommandType.LOOKS_RARE_V2, [value, calldata])

      const { commands, inputs } = planner

      await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).not.to.eq(ALICE_ADDRESS)

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })

  describe('Bulk Buy', () => {
    beforeEach(async () => {
      await resetFork(17037139)
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

    it('Buys 2 Dragons', async () => {
      order = looksRareV2Orders[1]
      order2 = looksRareV2Orders[2]
      const { takerBids, makerOrders, makerSignatures, totalValue, merkleTrees } = createLooksRareV2Orders(
        [order, order2],
        alice.address
      )

      const tokenId = makerOrders[0].itemIds[0]
      const tokenId2 = makerOrders[1].itemIds[0]
      const calldata = looksRareV2Interface.encodeFunctionData('executeMultipleTakerBids', [
        takerBids,
        makerOrders,
        makerSignatures,
        merkleTrees,
        ZERO_ADDRESS,
        false,
      ])

      planner.addCommand(CommandType.LOOKS_RARE_V2, [totalValue, calldata])

      const { commands, inputs } = planner

      await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).not.to.eq(ALICE_ADDRESS)
      await expect((await dragonNFT.connect(alice).ownerOf(tokenId2)).toLowerCase()).not.to.eq(ALICE_ADDRESS)

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: totalValue })

      await expect((await dragonNFT.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await dragonNFT.connect(alice).ownerOf(tokenId2)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })
})
