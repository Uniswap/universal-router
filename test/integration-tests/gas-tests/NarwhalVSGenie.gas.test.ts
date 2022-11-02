import { CommandType, RoutePlanner } from '../shared/planner'
import { Router, Permit2, ERC721 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  AdvancedOrder,
} from '../shared/protocolHelpers/seaport'
import { COVEN_721, ENS_721, GENIE_SWAP, resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
import { Contract, BigNumber } from 'ethers'
import { genieX2Y2MarketInterface, TradeDetails } from '../shared/protocolHelpers/genieSwap'
import { x2y2Orders, X2Y2_INTERFACE } from '../shared/protocolHelpers/x2y2'
import { expect } from 'chai'
const { ethers } = hre
import fs from 'fs'

describe('NFT UX Tests', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let planner: RoutePlanner
  let genieSwap: Contract

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    planner = new RoutePlanner()
    genieSwap = GENIE_SWAP.connect(alice)
  })

  describe('Seaport', () => {
    let seaportCalldata: string
    let value: BigNumber
    let advancedOrder: AdvancedOrder
    let cryptoCovens: ERC721

    beforeEach(async () => {
      ;({ advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0]))
      seaportCalldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])
      cryptoCovens = COVEN_721.connect(alice) as ERC721
    })

    describe('Narwhal', async () => {
      it('ETH -> NFT', async () => {
        planner.addCommand(CommandType.SEAPORT, [value.toString(), seaportCalldata])
        const { commands, inputs } = planner

        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
      })

      const ownerAfter = await cryptoCovens.ownerOf(advancedOrder.parameters.offer[0].identifierOrCriteria)
      expect(ownerAfter.toLowerCase()).to.eq(ALICE_ADDRESS)
    })

    describe('Genie', async () => {
      it('ETH -> NFT', async () => {
        let tradeDetails: TradeDetails[] = [
          {
            marketId: 21,
            value: value,
            tradeData: seaportCalldata,
          },
        ]

        await snapshotGasCost(
          genieSwap.multiAssetSwap(
            [[], []],
            [],
            [],
            [],
            tradeDetails,
            ['0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
            [0, 0],
            { value }
          )
        )
      })

      const ownerAfter = await cryptoCovens.ownerOf(advancedOrder.parameters.offer[0].identifierOrCriteria)
      expect(ownerAfter.toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })

  describe('X2Y2', () => {
    let x2y2Calldata: string
    let value: BigNumber
    let nftAddress: string
    let tokenId: number
    const erc721Order = x2y2Orders[0]
    const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))

    beforeEach(async () => {
      value = erc721Order.price
      tokenId = erc721Order.token_id
      nftAddress = ENS_721.address
    })

    describe('Narwhal', async () => {
      it('ETH -> NFT', async () => {
        x2y2Calldata = functionSelector + erc721Order.input.slice(2)

        planner.addCommand(CommandType.X2Y2_721, [value, x2y2Calldata, ALICE_ADDRESS, nftAddress, tokenId])
        const { commands, inputs } = planner

        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))

        const ownerAfter = await ENS_721.connect(alice).ownerOf(tokenId)
        expect(ownerAfter.toLowerCase()).to.eq(ALICE_ADDRESS)
      })
    })

    describe('Genie', async () => {
      it('ETH -> NFT', async () => {
        const genieX2Y2SignedOrder = JSON.parse(
          fs.readFileSync('test/integration-tests/shared/orders/genie/X2Y2.json', { encoding: 'utf8' })
        )[0]
        x2y2Calldata = functionSelector + genieX2Y2SignedOrder.input.slice(2)

        const genieCalldata = genieX2Y2MarketInterface.encodeFunctionData('buyAssetsForEth', [
          [x2y2Calldata],
          [nftAddress],
          [tokenId],
          [value],
          ALICE_ADDRESS,
        ])

        let tradeDetails: TradeDetails[] = [
          {
            marketId: 19,
            value: value,
            tradeData: genieCalldata,
          },
        ]

        await snapshotGasCost(
          genieSwap.multiAssetSwap(
            [[], []],
            [],
            [],
            [],
            tradeDetails,
            ['0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
            [0, 0],
            { value }
          )
        )

        const ownerAfter = await ENS_721.connect(alice).ownerOf(tokenId)
        expect(ownerAfter.toLowerCase()).to.eq(ALICE_ADDRESS)
      })
    })
  })
})
