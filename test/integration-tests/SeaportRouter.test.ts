import type { Contract } from '@ethersproject/contracts'
import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { Router, Permit2 } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/solmate/tokens/ERC721.sol/ERC721.json'
import { seaportOrders, seaportInterface, getAdvancedOrderParams } from './shared/protocolHelpers/seaport'
import deployRouter, { deployPermit2 } from './shared/deployRouter'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

describe('Seaport', () => {
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

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('completes a fulfillAvailableAdvancedOrders type', async () => {
    const { advancedOrder: advancedOrder0, value: value1 } = getAdvancedOrderParams(seaportOrders[0])
    const { advancedOrder: advancedOrder1, value: value2 } = getAdvancedOrderParams(seaportOrders[1])
    const params0 = advancedOrder0.parameters
    const params1 = advancedOrder1.parameters
    const value = value1.add(value2)
    const considerationFulfillment = [
      [[0, 0]],
      [
        [0, 1],
        [1, 1],
      ],
      [
        [0, 2],
        [1, 2],
      ],
      [[1, 0]],
    ]

    const calldata = seaportInterface.encodeFunctionData('fulfillAvailableAdvancedOrders', [
      [advancedOrder0, advancedOrder1],
      [],
      [[[0, 0]], [[1, 0]]],
      considerationFulfillment,
      OPENSEA_CONDUIT_KEY,
      alice.address,
      100,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    const owner0Before = await covenContract.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1Before = await covenContract.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

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
