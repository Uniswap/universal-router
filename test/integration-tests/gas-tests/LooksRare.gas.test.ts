import { CommandType, RoutePlanner } from './../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, TWERKY_ADDRESS, DEADLINE, ZERO_ADDRESS } from './../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre
import { BigNumber } from 'ethers'
import {
  createLooksRareOrders,
  looksRareOrders,
  MakerOrder,
  TakerOrder,
  looksRareInterface,
  LOOKS_RARE_1155_ORDER,
  LOOKS_RARE_721_ORDER,
} from '../shared/protocolHelpers/looksRare'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { LRV2APIOrder, createLooksRareV2Order, looksRareV2Interface, looksRareV2Orders } from '../shared/protocolHelpers/looksRareV2'

describe('LooksRare Gas Tests', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let value: BigNumber
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()

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

    it('gas: buy 1 ERC-721 on looks rare', async () => {
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.addCommand(CommandType.LOOKS_RARE_721, [
        value.toString(),
        calldata,
        ALICE_ADDRESS,
        COVEN_ADDRESS,
        tokenId,
      ])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
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

    it('gas: buy 1 ERC-1155 on looks rare', async () => {
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })
})

describe('LooksRareV2 Gas Test', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let order: LRV2APIOrder

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
