import type { Contract } from '@ethersproject/contracts'
import { RouterPlanner, SeaportCommand } from '@uniswap/narwhal-sdk'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { Router } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  getOrderParams,
} from './shared/protocolHelpers/seaport'

import { resetFork } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  OPENSEA_CONDUIT_KEY,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

describe('Seaport', () => {
  let alice: SignerWithAddress
  let router: Router
  let covenContract: Contract
  let planner: RouterPlanner

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
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
  })

  it('completes a fulfillOrder type', async () => {
    const { order, value } = getOrderParams(seaportOrders[0])
    const params = order.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillOrder', [order, OPENSEA_CONDUIT_KEY])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router.execute(DEADLINE, commands, state, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(router.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
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

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router.execute(DEADLINE, commands, state, { value })).wait()
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

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const owner0Before = await covenContract.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1Before = await covenContract.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router.execute(DEADLINE, commands, state, { value })).wait()

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

  it('gas fulfillOrder', async () => {
    const { order, value } = getOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillOrder', [order, OPENSEA_CONDUIT_KEY])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })

  it('gas fulfillAdvancedOrder', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })

  it('gas fulfillAvailableAdvancedOrders 1 orders', async () => {
    const { advancedOrder: advancedOrder0, value: value1 } = getAdvancedOrderParams(seaportOrders[0])
    const { advancedOrder: advancedOrder1, value: value2 } = getAdvancedOrderParams(seaportOrders[1])
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

    planner.add(SeaportCommand(value, calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
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

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await expect(router.execute(DEADLINE, commands, state, { value })).to.be.revertedWith(
      'ExecutionFailed(0, "0x815e1d64")'
    )
  })
})
