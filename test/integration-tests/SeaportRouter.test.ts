import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { Router } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
} from './shared/protocolHelpers/seaport'
import deployRouter from './shared/deployRouter'
import { COVEN_721, resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

describe('Seaport', () => {
  let alice: SignerWithAddress
  let router: Router
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

    const ownerBefore = await COVEN_721.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const ownerAfter = await COVEN_721.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('completes a fulfillAvailableAdvancedOrders type', async () => {
    const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoCovensSeaport(alice.address)
    const params0 = advancedOrder0.parameters
    const params1 = advancedOrder1.parameters
    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    const owner0Before = await COVEN_721.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1Before = await COVEN_721.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const owner0After = await COVEN_721.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1After = await COVEN_721.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(owner0Before.toLowerCase()).to.eq(params0.offerer)
    expect(owner1Before.toLowerCase()).to.eq(params1.offerer)
    expect(owner0After).to.eq(alice.address)
    expect(owner1After).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('reverts if order does not go through', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    advancedOrder.parameters.salt = BigNumber.from('6666666666666666')
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.be.revertedWith(
      'ExecutionFailed(0, "0x815e1d64")'
    )
  })
})
