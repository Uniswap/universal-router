import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber, Contract } from 'ethers'
import { UniversalRouter, Permit2, ERC721, ERC1155 } from '../../typechain'
import {
  seaportV1_5Orders,
  seaportInterface,
  getAdvancedOrderParams,
  seaportV1_4Orders,
  purchaseDataForTwoTownstarsSeaport,
} from './shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { COVEN_721, resetFork, TOWNSTAR_1155, GALA } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ETH_ADDRESS, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { findCustomErrorSelector } from './shared/parseEvents'
import { getPermitSignature } from './shared/protocolHelpers/permit2'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
const { ethers } = hre

describe('Seaport v1.5', () => {
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let townStarNFT: ERC1155
  let alice: SignerWithAddress

  describe('ETH -> NFT', () => {
    beforeEach(async () => {
      await resetFork(17179617)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      townStarNFT = TOWNSTAR_1155.connect(alice) as ERC1155
    })

    it('completes a fulfillAdvancedOrder type', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_5Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])
      const tokenId = params.offer[0].identifierOrCriteria

      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      const { commands, inputs } = planner

      const balanceBefore = await townStarNFT.balanceOf(alice.address, tokenId)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const balanceAfter = await townStarNFT.balanceOf(alice.address, tokenId)

      expect(balanceAfter.sub(balanceBefore)).to.eq(1)
    })

    it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportV1_5Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])
      const tokenId = params.offer[0].identifierOrCriteria

      // Allow seaport to revert
      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata], true)
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

      const { commands, inputs } = planner

      const balanceBefore = await townStarNFT.balanceOf(alice.address, tokenId)

      // don't send enough ETH, so the seaport purchase reverts
      value = BigNumber.from(value).sub(1)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, 0)

      const balanceAfter = await townStarNFT.balanceOf(alice.address, tokenId)
      // The balance was unchanged, the user got the eth back
      expect(balanceBefore).to.eq(balanceAfter)
    })

    it('completes a fulfillAvailableAdvancedOrders type', async () => {
      const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoTownstarsSeaport(alice.address)
      const params0 = advancedOrder0.parameters
      const params1 = advancedOrder1.parameters
      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      const { commands, inputs } = planner

      const balance0Before = await townStarNFT.balanceOf(alice.address, params0.offer[0].identifierOrCriteria)
      const balance1Before = await townStarNFT.balanceOf(alice.address, params1.offer[0].identifierOrCriteria)

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const balance0After = await townStarNFT.balanceOf(alice.address, params0.offer[0].identifierOrCriteria)
      const balance1After = await townStarNFT.balanceOf(alice.address, params1.offer[0].identifierOrCriteria)

      expect(balance0After.sub(balance0Before)).to.eq(1)
      expect(balance1After.sub(balance1Before)).to.eq(1)
    })

    it('reverts if order does not go through', async () => {
      let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportV1_5Orders[1]))

      invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
      const { advancedOrder: seaportOrder, value: seaportValue } = getAdvancedOrderParams(invalidSeaportOrder)

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        seaportOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [seaportValue.toString(), calldata])
      const { commands, inputs } = planner

      const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
      const customErrorSelector = findCustomErrorSelector(testCustomErrors.interface, 'InvalidSignature')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: seaportValue }))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})

describe('Seaport v1.4', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let cryptoCovens: ERC721
  let galaContract: Contract
  let townStarNFT: Contract

  describe('ERC20 -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16784348 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      galaContract = new ethers.Contract(GALA.address, TOKEN_ABI, alice)

      // alice can't sign permits as we don't have her private key. Instead bob is used
      bob = (await ethers.getSigners())[1]
      permit2 = (await deployPermit2()).connect(bob) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
      planner = new RoutePlanner()
      townStarNFT = TOWNSTAR_1155.connect(bob) as ERC1155
      await galaContract.connect(bob).approve(permit2.address, ethers.constants.MaxUint256)

      // Alice seeds bob's account with GALA for tests
      await galaContract.transfer(bob.address, 100000 * 10 ** 8)
    })

    it('completes a fulfillAdvancedOrder type', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[2])
      value = value.div(2) // the numerator/denominator mean this is a partial fill
      const params = advancedOrder.parameters
      const considerationToken = params.consideration[0].token
      const tokenId = params.offer[0].identifierOrCriteria

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        bob.address,
      ])

      const permit = {
        details: {
          token: considerationToken,
          amount: value,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      planner.addCommand(CommandType.APPROVE_ERC20, [considerationToken, 0])
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [considerationToken, router.address, value])
      planner.addCommand(CommandType.SEAPORT_V1_4, [0, calldata])

      const { commands, inputs } = planner
      await expect(await townStarNFT.balanceOf(bob.address, tokenId)).to.eq(0)
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.changeTokenBalance(
        galaContract,
        bob.address,
        value.mul(-1)
      )
      await expect(await townStarNFT.balanceOf(bob.address, tokenId)).to.eq(1)
    })
  })

  describe('ETH -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16784176 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      cryptoCovens = COVEN_721.connect(alice) as ERC721
    })

    it('completes a fulfillAdvancedOrder type', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
      const { commands, inputs } = planner

      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))
      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer.toLowerCase())
      expect(ownerAfter).to.eq(alice.address)
    })

    it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      // Allow seaport to revert
      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata], true)
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

      const commands = planner.commands
      const inputs = planner.inputs

      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      const ethBefore = await ethers.provider.getBalance(alice.address)

      // don't send enough ETH, so the seaport purchase reverts
      value = BigNumber.from(value).sub('1')
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).wait()

      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
      const ethDelta = ethBefore.sub(ethAfter)

      // The owner was unchanged, the user got the eth back
      expect(ownerBefore.toLowerCase()).to.eq(ownerAfter.toLowerCase())
      expect(ethDelta).to.eq(gasSpent)
    })

    it('reverts if order does not go through', async () => {
      let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportV1_4Orders[0]))

      invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
      const { advancedOrder: seaportOrder, value: seaportValue } = getAdvancedOrderParams(invalidSeaportOrder)

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        seaportOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [seaportValue.toString(), calldata])
      const { commands, inputs } = planner

      const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
      const customErrorSelector = findCustomErrorSelector(testCustomErrors.interface, 'InvalidSignature')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: seaportValue }))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})
