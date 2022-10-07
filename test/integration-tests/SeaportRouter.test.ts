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
