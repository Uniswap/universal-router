import { abi as ERC721_ABI } from '../../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import GenieLooksRareMarket from '../shared/abis/genie/GenieLooksRareMarket.json'
import { Interface } from '@ethersproject/abi'
import { CommandType, RoutePlanner } from '../shared/planner'
import { ContractTransaction } from 'ethers'
import { UniversalRouter, Permit2, ERC721 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseNFTsWithSeaport,
  AdvancedOrder,
  purchaseDataForTwoCovensSeaport,
} from '../shared/protocolHelpers/seaport'
import {
  APIOrder as APIOrderLooksRare,
  createLooksRareOrders,
  looksRareInterface,
  looksRareOrders,
  LOOKS_RARE_1155_ORDER,
  LOOKS_RARE_721_ORDER,
  MakerOrder,
  TakerOrder,
} from '../shared/protocolHelpers/looksRare'
import { COVEN_721, ENS_721, GEM_SWAP, GENIE_SWAP, resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { Contract, BigNumber } from 'ethers'
import { genieX2Y2MarketInterface, TradeDetails } from '../shared/protocolHelpers/genieSwap'
import { x2y2Orders, X2Y2_INTERFACE } from '../shared/protocolHelpers/x2y2'
import { expect } from 'chai'
const { ethers } = hre
import fs from 'fs'

import GENIE_SWAP_ABI from '../shared/abis/genie/GenieSwap.json'
const CURRENT_BLOCK = 15991900

export const massSeaportOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/gas-tests/orders/openseaOrders.json', { encoding: 'utf8' })
)

export const massLooksRareOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/gas-tests/orders/looksrareOrders.json', { encoding: 'utf8' })
)

describe.only('NFT UX Tests gas', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let genieSwap: Contract
  let gemSwap: Contract
  let cryptoCovens: ERC721

  beforeEach(async () => {
    await resetFork(CURRENT_BLOCK)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    cryptoCovens = COVEN_721.connect(alice) as ERC721
    planner = new RoutePlanner()
    genieSwap = GENIE_SWAP.connect(alice)
    gemSwap = GEM_SWAP.connect(alice)
  })

  describe('Seaport', () => {
    describe('ETH -> 1 NFT', async () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 1, numLooksRareBuys: 0})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 1, numLooksRareBuys: 0})
      })

      it('Gem')
    })

    describe('ETH -> 4 NFTs', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 4, numLooksRareBuys: 0})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 4, numLooksRareBuys: 0})
      })

      it('Gem')
    })
  })

  describe('LooksRare', () => {
    describe('ETH -> 1 NFT', async () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 1})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 1})
      })

      it('Gem', async () => {})
    })

    describe('ETH -> 2 NFTs', async () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 2})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 2})
      })

      it('Gem', async () => {})
    })

    describe('ETH -> 4 NFTs', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 4})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 4})
      })

      it('Gem', async () => {})
    })

    describe('ETH -> 10 NFTs', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 10})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 10})
      })

      it('Gem')
    })

    describe('ETH -> 20 NFTs', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 20})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 0, numLooksRareBuys: 20})
      })

      it('Gem')
    })
  })

  describe('Mixed LooksRare + Seaport', () => {
    describe('ETH -> 3 Seaport, 1 LooksRare', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 1})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 1})
      })

      it('Gem', async () => {
        // taken from manual simulation
        await snapshotGasCost(725500)
      })
    })

    describe('ETH -> 3 Seaport, 3 LooksRare', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 3})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 3})
      })

      it('Gem', async () => {
        // taken from manual simulation
        await snapshotGasCost(1245165)
      })
    })

    describe('ETH -> 3 Seaport, 5 LooksRare', () => {
      it('Universal Router', async () => {
        await testUniversalRouterNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 5})
      })

      it('Genie', async () => {
        await testGenieNFTSwap({numSeaportBuys: 3, numLooksRareBuys: 5})
      })

      it('LooksRare', async () => {
        // taken from manual simulation
        await snapshotGasCost(1245165)
      })
    })
  })

  describe.skip('X2Y2', () => {
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

    describe('Universal Router', async () => {
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

        let tradeDetails: TradeDetails[] = [{ marketId: 19, value: value, tradeData: genieCalldata }]
        await snapshotGasCost(genieMultiAssetSwap(tradeDetails))
        const ownerAfter = await ENS_721.connect(alice).ownerOf(tokenId)
        expect(ownerAfter.toLowerCase()).to.eq(ALICE_ADDRESS)
      })
    })
  })


  type TestMetrics = {
    numSeaportBuys: number
    numLooksRareBuys: number
  }

  async function testUniversalRouterNFTSwap(metrics: TestMetrics) {
    const allowRevert = true
    let totalValue = BigNumber.from(0)

    if (metrics.numSeaportBuys > 0) {
      const { calldata: seaportdata, value } = purchaseNFTsWithSeaport(
        massSeaportOrders.slice(0, metrics.numSeaportBuys),
        alice.address
      )
      planner.addCommand(CommandType.SEAPORT, [value.toString(), seaportdata], allowRevert)
      totalValue = totalValue.add(value)
    }

    if (metrics.numLooksRareBuys > 0) {
      let looksrareValue = BigNumber.from(0)
      for (let i = 0; i < metrics.numLooksRareBuys; i++) {
        const { makerOrder, takerOrder, value, calldata } = createLooksRareCalldata(massLooksRareOrders[i])
        planner.addCommand(CommandType.LOOKS_RARE_721, [
          value,
          calldata,
          ALICE_ADDRESS,
          makerOrder.collection,
          makerOrder.tokenId,
        ], allowRevert)
        totalValue = totalValue.add(value)
      }
    }

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: totalValue }))

    for (let i = 0; i < metrics.numLooksRareBuys; i++) {
      if ( i != 18) { // #18 taken
        const makerOrder = massLooksRareOrders[i]
        const nft = new ethers.Contract(makerOrder.collectionAddress, ERC721_ABI).connect(alice) as ERC721
        expect(await nft.ownerOf(makerOrder.tokenId)).to.eq(alice.address)
      }
    }
    for (let i = 0; i < metrics.numSeaportBuys; i++) {
      expect(await cryptoCovens.ownerOf(gettokenIdFromSeaport(massSeaportOrders[i]))).to.eq(alice.address)
    }
  }

  async function testGenieNFTSwap(metrics: TestMetrics) {
    let tradeDetails: TradeDetails[] = []
    let totalValue = BigNumber.from(0)

    if (metrics.numSeaportBuys > 0) {
      const { calldata, value } = purchaseNFTsWithSeaport(
        massSeaportOrders.slice(0, metrics.numSeaportBuys),
        alice.address
      )
      tradeDetails.push({ marketId: 21, tradeData: calldata, value })
      totalValue = totalValue.add(value)
    }

    if (metrics.numLooksRareBuys > 0) {
      const {
        makerOrders,
        takerOrders,
        value,
        calldata,
      } = createLooksRareCalldataGenie(massLooksRareOrders.slice(0, metrics.numLooksRareBuys))
      tradeDetails.push({ marketId: 18, value, tradeData: calldata })
      totalValue = totalValue.add(value)
    }

    await snapshotGasCost(genieMultiAssetSwap(tradeDetails))

    for (let i = 0; i < metrics.numLooksRareBuys; i++) {
      if ( i != 18) { // #18 taken
        const makerOrder = massLooksRareOrders[i]
        const nft = new ethers.Contract(makerOrder.collectionAddress, ERC721_ABI).connect(alice) as ERC721
        expect(await nft.ownerOf(makerOrder.tokenId)).to.eq(alice.address)
      }
    }
    for (let i = 0; i < metrics.numSeaportBuys; i++) {
      expect(await cryptoCovens.ownerOf(gettokenIdFromSeaport(massSeaportOrders[0]))).to.eq(alice.address)
    }
  }

  // will fix any's later
  function gettokenIdFromSeaport(order: any): string {
    return order.protocol_data.parameters.offer[0].identifierOrCriteria
  }

  function genieMultiAssetSwap(tradeDetails: TradeDetails[]): Promise<ContractTransaction> {
    const value = tradeDetails.reduce((prev, trade) => {
      return prev.add(BigNumber.from(trade.value))
    }, BigNumber.from(0))

    return genieSwap.multiAssetSwap(
      [[], []],
      [],
      [],
      [],
      tradeDetails,
      ['0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
      [0, 0],
      { value, gasLimit: '10000000' }
    )
  }

  type LooksRareReturns = {
    makerOrders: MakerOrder[]
    takerOrders: TakerOrder[]
    value: BigNumber
    calldata: string
  }

  type LooksRareReturn = {
    makerOrder: MakerOrder
    takerOrder: TakerOrder
    value: BigNumber
    calldata: string
  }

  function createLooksRareCalldataGenie(orders: APIOrderLooksRare[]): LooksRareReturns {
    let makerOrders = []
    let takerOrders = []
    let totalValue = BigNumber.from(0)

    for (let order of orders) {
      const { makerOrder, takerOrder, value } = createLooksRareOrders(
        order,
        '0x31837aaF36961274a04B915697FdfCA1Af31a0C7'
      )
      makerOrders.push(makerOrder)
      takerOrders.push(takerOrder)
      totalValue = totalValue.add(value)
    }
    const calldata = new Interface(GenieLooksRareMarket).encodeFunctionData('buyAssetsForEth', [
      takerOrders,
      makerOrders,
      alice.address,
    ])
    return { makerOrders, takerOrders, value: totalValue, calldata }
  }

  function createLooksRareCalldata(order: APIOrderLooksRare): LooksRareReturn {
    const { makerOrder, takerOrder, value } = createLooksRareOrders(order, router.address)
    const tokenId = makerOrder.tokenId

    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder,
      makerOrder,
    ])

    return { makerOrder, takerOrder, value, calldata }
  }
})
