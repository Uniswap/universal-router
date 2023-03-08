import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber, Contract } from 'ethers'
import { UniversalRouter, Permit2, ERC721 } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  seaportV1_4Interface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
  seaportV1_4Orders,
  ZERO_CONDUIT_KEY,
} from './shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { COVEN_721, WETH, resetFork } from './shared/mainnetForkHelpers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC20_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { ALICE_ADDRESS, DEADLINE, ETH_ADDRESS, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { findCustomErrorSelector } from './shared/parseEvents'
import { getPermitSignature } from './shared/protocolHelpers/permit2'
const { ethers } = hre

describe('Seaport', () => {
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let cryptoCovens: ERC721
  let weth: Contract

  // @dev We have to separate the ERC20 tests because we use orders taken from a much
  // newer block. If we were to replace all of the example orders with newer ones,
  // many existing tests would break.
  describe('Seaport ERC20 -> NFT', () => {
    let bob: SignerWithAddress
    beforeEach(async () => {
      await resetFork(16635782)
      // alice's permits fail w/ account not found so using bob from default signers
      bob = (await ethers.getSigners())[1]
      permit2 = (await deployPermit2()).connect(bob) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
      planner = new RoutePlanner()
      cryptoCovens = COVEN_721.connect(bob) as ERC721
      weth = new ethers.Contract(WETH.address, ERC20_ABI, bob)

      // bob deposits 10 eth into weth
      await bob.sendTransaction({ to: weth.address, value: ethers.utils.parseEther('10') })
      // approve permit2 for all for bob's weth
      await weth.approve(permit2.address, ethers.constants.MaxUint256)
    })

    it('completes an advanced order offering ERC20', async () => {
      // seaportOrders[2] is an order containing ERC20 (WETH) as consideration
      const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[2])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        bob.address,
      ])
      const considerationToken = params.consideration[0].token
      const permit = {
        details: {
          token: weth.address,
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
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [weth.address, router.address, value])
      planner.addCommand(CommandType.SEAPORT, [0, calldata])
      const { commands, inputs } = planner

      const wethBalanceBefore = await weth.balanceOf(bob.address)
      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      const wethBalanceAfter = await weth.balanceOf(bob.address)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
      expect(ownerAfter).to.eq(bob.address)
      expect(wethBalanceBefore.sub(wethBalanceAfter)).to.eq(value)
    })

    it('completes an advanced order where ERC20 is already approved', async () => {
      // seaportOrders[2] is an order containing ERC20 (WETH) as consideration
      const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[2])
      const params = advancedOrder.parameters
      const considerationToken = params.consideration[0].token

      // A previous txn which approves the conduit to spend the router's consideration token balance
      planner.addCommand(CommandType.APPROVE_ERC20, [considerationToken, 0])
      await router['execute(bytes,bytes[],uint256)'](planner.commands, planner.inputs, DEADLINE, { value: 0 })

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        bob.address,
      ])

      const permit = {
        details: {
          token: weth.address,
          amount: value,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      planner = new RoutePlanner()
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [weth.address, router.address, value])
      planner.addCommand(CommandType.SEAPORT, [0, calldata])
      const { commands, inputs } = planner

      const wethBalanceBefore = await weth.balanceOf(bob.address)
      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      const wethBalanceAfter = await weth.balanceOf(bob.address)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
      expect(ownerAfter).to.eq(bob.address)
      expect(wethBalanceBefore.sub(wethBalanceAfter)).to.eq(value)
    })
  })

  describe('Seaport ETH -> NFT', () => {
    let alice: SignerWithAddress
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
      cryptoCovens = COVEN_721.connect(alice) as ERC721
      weth = new ethers.Contract(WETH.address, ERC20_ABI, alice)
    })

    it('completes a fulfillAdvancedOrder type', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
      const { commands, inputs } = planner

      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
      expect(ownerAfter).to.eq(alice.address)
    })

    it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      // Allow seaport to revert
      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata], true)
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

      const { commands, inputs } = planner

      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)

      // don't send enough ETH, so the seaport purchase reverts
      value = BigNumber.from(value).sub(1)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, 0)

      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      // The owner was unchanged, the user got the eth back
      expect(ownerBefore.toLowerCase()).to.eq(ownerAfter.toLowerCase())
    })

    it('completes a fulfillAvailableAdvancedOrders type', async () => {
      const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoCovensSeaport(alice.address)
      const params0 = advancedOrder0.parameters
      const params1 = advancedOrder1.parameters
      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
      const { commands, inputs } = planner

      const owner0Before = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1Before = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const owner0After = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1After = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)

      expect(owner0Before.toLowerCase()).to.eq(params0.offerer)
      expect(owner1Before.toLowerCase()).to.eq(params1.offerer)
      expect(owner0After).to.eq(alice.address)
      expect(owner1After).to.eq(alice.address)
    })

    it('reverts if order does not go through', async () => {
      let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportOrders[0]))

      invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
      const { advancedOrder: seaportOrder, value: seaportValue } = getAdvancedOrderParams(invalidSeaportOrder)

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        seaportOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT, [seaportValue.toString(), calldata])
      const { commands, inputs } = planner

      const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
      const customErrorSelector = findCustomErrorSelector(testCustomErrors.interface, 'InvalidSignature')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: seaportValue }))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})

xdescribe('SeaportV1_4', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let testing721Token: ERC721

  const testingTokenAddress = '0x399F0c34c0193674A29e290Eef484DA007DDeF4E'

  describe('SeaportV2 ETH -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16592843 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      testing721Token = new ethers.Contract(testingTokenAddress, ERC721_ABI).connect(alice) as ERC721
    })

    it('completes a fulfillAdvancedOrder type', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportV1_4Interface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        ZERO_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
      const { commands, inputs } = planner

      const ownerBefore = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
      const ethBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).wait()
      const ownerAfter = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
      const ethDelta = ethBefore.sub(ethAfter)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer.toLowerCase())
      expect(ownerAfter).to.eq(alice.address)
      expect(ethDelta.sub(gasSpent)).to.eq(value)
    })

    it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportV1_4Interface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        ZERO_CONDUIT_KEY,
        alice.address,
      ])

      // Allow seaport to revert
      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata], true)
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

      const commands = planner.commands
      const inputs = planner.inputs

      const ownerBefore = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
      const ethBefore = await ethers.provider.getBalance(alice.address)

      // don't send enough ETH, so the seaport purchase reverts
      value = BigNumber.from(value).sub('1')
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).wait()

      const ownerAfter = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
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

      const calldata = seaportV1_4Interface.encodeFunctionData('fulfillAdvancedOrder', [
        seaportOrder,
        [],
        ZERO_CONDUIT_KEY,
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
