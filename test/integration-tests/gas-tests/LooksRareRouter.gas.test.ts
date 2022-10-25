import { CommandType, RoutePlanner } from './../shared/planner'
import { Router } from '../../../typechain'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, TWERKY_ADDRESS, DEADLINE } from './../shared/constants'
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
} from '../shared/protocolHelpers/looksrare'
import deployRouter from '../shared/deployRouter'

describe('LooksRare Gas Tests', () => {
  let alice: SignerWithAddress
  let router: Router
  let value: BigNumber
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    router = (await deployRouter()).connect(alice) as Router
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
      commands = planner.commands
      inputs = planner.inputs
    })

    it('gas: buy 1 ERC-1155 on looks rare', async () => {
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })
})
