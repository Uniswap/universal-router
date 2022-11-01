import type { Contract } from '@ethersproject/contracts'
import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { Permit2, Router } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/solmate/tokens/ERC721.sol/ERC721.json'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
} from './shared/protocolHelpers/seaport'
import { createLooksRareOrders, looksRareOrders, LOOKS_RARE_1155_ORDER } from './shared/protocolHelpers/looksRare'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter, { deployPermit2 } from './shared/deployRouter'
const { ethers } = hre

describe('Check Ownership', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let covenContract: Contract
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    planner = new RoutePlanner()
  })

  describe('checksOwnership ERC721', () => {
    it('passes with valid owner', async () => {
      const { advancedOrder } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        params.offerer,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for invalid ownership', async () => {
      const { advancedOrder } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.be.revertedWith(
        'ExecutionFailed(0, "0x7dbe7e89")'
      )
    })

    it('checks ownership after a seaport trade for one ERC721', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner

      const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
      const ethBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).wait()
      const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
      const ethDelta = ethBefore.sub(ethAfter)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
      expect(ownerAfter).to.eq(alice.address)
      expect(ethDelta.sub(gasSpent)).to.eq(value)
    })

    it('checks ownership after a seaport trade for two ERC721s', async () => {
      const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoCovensSeaport(alice.address)
      const params0 = advancedOrder0.parameters
      const params1 = advancedOrder1.parameters

      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params0.offer[0].identifierOrCriteria,
      ])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params1.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner

      const owner0Before = await covenContract.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1Before = await covenContract.ownerOf(params1.offer[0].identifierOrCriteria)
      const ethBefore = await ethers.provider.getBalance(alice.address)

      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).wait()

      const owner0After = await covenContract.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1After = await covenContract.ownerOf(params1.offer[0].identifierOrCriteria)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
      const ethDelta = ethBefore.sub(ethAfter)

      expect(owner0Before.toLowerCase()).to.eq(params0.offerer)
      expect(owner1Before.toLowerCase()).to.eq(params1.offerer)
      expect(owner0After).to.eq(alice.address)
      expect(owner1After).to.eq(alice.address)
      expect(ethDelta.sub(gasSpent)).to.eq(value)
    })
  })

  describe('checksOwnership ERC1155', () => {
    it('passes with valid ownership', async () => {
      const { makerOrder } = createLooksRareOrders(looksRareOrders[LOOKS_RARE_1155_ORDER], router.address)

      planner.addCommand(CommandType.OWNER_CHECK_1155, [
        makerOrder.signer,
        makerOrder.collection,
        makerOrder.tokenId,
        1,
      ])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for invalid ownership', async () => {
      const { makerOrder } = createLooksRareOrders(looksRareOrders[LOOKS_RARE_1155_ORDER], router.address)

      planner.addCommand(CommandType.OWNER_CHECK_1155, [alice.address, makerOrder.collection, makerOrder.tokenId, 1])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.be.revertedWith(
        'ExecutionFailed(0, "0x483a6929")'
      )
    })
  })
})
