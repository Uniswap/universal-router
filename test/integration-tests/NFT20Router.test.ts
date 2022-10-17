import { RouterPlanner, LooksRareCommand721, LooksRareCommand1155 } from '@uniswap/narwhal-sdk'
import { Router, MockERC721, MockERC1155, NFT20_FACTORY } from '../../typechain'
import { resetFork, COVEN_721, TWERKY_1155 } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  TWERKY_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  NFT20_FACTORY_ADDRESS,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre
import { BigNumber } from 'ethers'
import fs from 'fs'

describe('NFT20', () => {
  let alice: SignerWithAddress
  let router: Router
  let value: BigNumber
  let planner: RouterPlanner
  let mockERC721: MockERC721
  let mockERC1155: MockERC1155

  beforeEach(async () => {
    await resetFork()
    const mockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await mockERC721Factory.deploy("TEST", "test");
    const mockERC1155Factory = await ethers.getContractFactory('MockERC1155')
    mockERC1155 = mockERC1155Factory.deploy();

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
    const nft20Factory = NFT20_FACTORY.connect(NFT20_FACTORY_ADDRESS);
    await nft20Factory.nft20Pair("MOCK721", mockERC721.address, 721);
    await nft20Factory.nft20Pair("MOCK1155", mockERC1155.address, 1155);

  })

  describe('Withdraw', () => {
    let tokenId: BigNumber

    beforeEach(async () => {
      await mockERC721.mint(ALICE_ADDRESS, 1);
      await mockERC1155.mint(ALICE_ADDRESS, 1, 100);
    })

    it('Properly withdraws ERC721 tokens', async () => {

      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.add(LooksRareCommand721(value, calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId))
      const { commands, state } = planner.plan()
      await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: value })

      await expect((await covenContract.connect(alice).ownerOf(tokenId)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })

    it('gas: buy 1 ERC-721 on looks rare', async () => {
      const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        takerOrder,
        makerOrder,
      ])

      planner.add(LooksRareCommand721(value.toString(), calldata, ALICE_ADDRESS, COVEN_ADDRESS, tokenId))
      const { commands, state } = planner.plan()

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value }))
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
      planner.add(LooksRareCommand1155(value, calldata, ALICE_ADDRESS, TWERKY_ADDRESS, tokenId, 1))
      ;({ commands, state } = planner.plan())
    })

    it('Buys a Twerky', async () => {
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(0)
      await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: value })
      await expect(await twerkyContract.balanceOf(alice.address, tokenId)).to.eq(1)
    })

    it('gas: buy 1 ERC-1155 on looks rare', async () => {
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value }))
    })
  })
})
