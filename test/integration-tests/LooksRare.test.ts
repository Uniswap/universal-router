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
