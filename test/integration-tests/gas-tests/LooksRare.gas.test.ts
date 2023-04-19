import { CommandType, RoutePlanner } from './../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ZERO_ADDRESS } from './../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import {
  LRV2APIOrder,
  createLooksRareV2Order,
  createLooksRareV2Orders,
  looksRareV2Interface,
  looksRareV2Orders,
} from '../shared/protocolHelpers/looksRareV2'

describe('LooksRareV2 Gas Test', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let order: LRV2APIOrder
  let order2: LRV2APIOrder

  describe('Single Buy', () => {
    beforeEach(async () => {
      await resetFork(17030829)

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)

      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
    })

    it('Buy a 721', async () => {
      order = looksRareV2Orders[0]
      const { takerBid, makerOrder, makerSignature, value, merkleTree } = createLooksRareV2Order(order, alice.address)
      const calldata = looksRareV2Interface.encodeFunctionData('executeTakerBid', [
        takerBid,
        makerOrder,
        makerSignature,
        merkleTree,
        ZERO_ADDRESS,
      ])
      planner.addCommand(CommandType.LOOKS_RARE_V2, [value, calldata])

      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })

  describe('Bulk Buy', () => {
    beforeEach(async () => {
      await resetFork(17037139)

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)

      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
    })

    it('Buys 2 721s', async () => {
      order = looksRareV2Orders[1]
      order2 = looksRareV2Orders[2]
      const { takerBids, makerOrders, makerSignatures, totalValue, merkleTrees } = createLooksRareV2Orders(
        [order, order2],
        alice.address
      )

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

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: totalValue }))
    })
  })
})
