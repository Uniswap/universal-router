import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { UniversalRouter, Permit2, ERC721 } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
} from './shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { COVEN_721, resetFork } from './shared/mainnetForkHelpers'
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
