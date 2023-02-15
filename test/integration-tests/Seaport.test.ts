import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { UniversalRouter, Permit2, ERC721 } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  seaportV2Interface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
  seaportV2Orders,
  ZERO_CONDUIT_KEY,
} from './shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { COVEN_721, resetFork } from './shared/mainnetForkHelpers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { ALICE_ADDRESS, DEADLINE, ETH_ADDRESS, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { findCustomErrorSelector } from './shared/parseEvents'
const { ethers } = hre

describe('Seaport', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let cryptoCovens: ERC721

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
    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.changeEtherBalance(
      alice,
      value.mul(-1)
    )
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

    const commands = planner.commands
    const inputs = planner.inputs

    const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)

    // don't send enough ETH, so the seaport purchase reverts
    value = BigNumber.from(value).sub('1')
    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.changeEtherBalance(
      alice,
      0
    )

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

    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.changeEtherBalance(
      alice,
      value.mul(-1)
    )

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

describe('SeaportV2', () => {
  // @dev TODO: change over to use cryptoCovens order once Seaport1.2 is used on OpenSea
  // for now using this order: https://etherscan.io/tx/0x5f7d6815611146b8d6bf454cc18fe7a68c5645e145999071e2d45fe9021e9357
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let testing721Token: ERC721

  const testingTokenAddress = '0x399F0c34c0193674A29e290Eef484DA007DDeF4E'

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
    const { advancedOrder, value } = getAdvancedOrderParams(seaportV2Orders[0])
    const params = advancedOrder.parameters
    const calldata = seaportV2Interface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      ZERO_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT_V2, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const ownerAfter = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer.toLowerCase())
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
    let { advancedOrder, value } = getAdvancedOrderParams(seaportV2Orders[0])
    const params = advancedOrder.parameters
    const calldata = seaportV2Interface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      ZERO_CONDUIT_KEY,
      alice.address,
    ])

    // Allow seaport to revert
    planner.addCommand(CommandType.SEAPORT_V2, [value.toString(), calldata], true)
    planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

    const commands = planner.commands
    const inputs = planner.inputs

    const ownerBefore = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    // don't send enough ETH, so the seaport purchase reverts
    value = BigNumber.from(value).sub('1')
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const ownerAfter = await testing721Token.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    // The owner was unchanged, the user got the eth back
    expect(ownerBefore.toLowerCase()).to.eq(ownerAfter.toLowerCase())
    expect(ethDelta).to.eq(gasSpent)
  })

  it('reverts if order does not go through', async () => {
    let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportV2Orders[0]))

    invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
    const { advancedOrder: seaportOrder, value: seaportValue } = getAdvancedOrderParams(invalidSeaportOrder)

    const calldata = seaportV2Interface.encodeFunctionData('fulfillAdvancedOrder', [
      seaportOrder,
      [],
      ZERO_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT_V2, [seaportValue.toString(), calldata])
    const { commands, inputs } = planner

    const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
    const customErrorSelector = findCustomErrorSelector(testCustomErrors.interface, 'InvalidSignature')
    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: seaportValue }))
      .to.be.revertedWithCustomError(router, 'ExecutionFailed')
      .withArgs(0, customErrorSelector)
  })
})
