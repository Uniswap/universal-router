import { Interface, LogDescription } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import type { Contract } from '@ethersproject/contracts'
import {
  RouterPlanner,
  SeaportCommand,
  SweepCommand,
  TransferCommand,
  V2ExactInputCommand,
  V2ExactOutputCommand,
  V3ExactInputCommand,
  UnwrapWETHCommand,
  WrapETHCommand,
} from '@uniswap/narwhal-sdk'
import { CurrencyAmount, Ether, Percent, Token } from '@uniswap/sdk-core'
import { expect } from './shared/expect'
import { BigNumber, Contract as EthersContract } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC721/IERC721.sol/IERC721.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'

import SEAPORT_ABI from './shared/abis/Seaport.json'
import { executeSwap, resetFork, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  OPENSEA_DEFAULT_ZONE,
  OPENSEA_CONDUIT,
  OPENSEA_CONDUIT_KEY,
  COVEN_ADDRESS,
} from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
const { ethers } = hre
import fs from 'fs'
import util from 'util'

const seaportOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/Seaport.json', { encoding: 'utf8' })
)
const seaportInterface = new ethers.utils.Interface(SEAPORT_ABI)

type OfferItem = {
  itemType: BigNumber // enum
  token: string // address
  identifierOrCriteria: BigNumber
  startAmount: BigNumber
  endAmount: BigNumber
}

type ConsiderationItem = OfferItem & {
  recipient: string
}

type OrderParameters = {
  offerer: string // address,
  offer: OfferItem[]
  consideration: ConsiderationItem[]
  orderType: BigNumber // enum
  startTime: BigNumber
  endTime: BigNumber
  zoneHash: string // bytes32
  salt: BigNumber
  conduitKey: string // bytes32,
  totalOriginalConsiderationItems: BigNumber
}

type Order = {
  parameters: OrderParameters
  signature: string
}

type AdvancedOrder = Order & {
  numerator: BigNumber // uint120
  denominator: BigNumber // uint120
  extraData: string // bytes
}

function getOrderParams(apiOrder: any): { order: Order; value: BigNumber } {
  delete apiOrder.protocol_data.parameters.counter
  const order = {
    parameters: apiOrder.protocol_data.parameters,
    signature: apiOrder.protocol_data.signature,
  }
  const value = calculateValue(apiOrder.protocol_data.parameters.consideration)
  return { order, value }
}

function getAdvancedOrderParams(apiOrder: any): { advancedOrder: AdvancedOrder; value: BigNumber } {
  delete apiOrder.protocol_data.parameters.counter
  const advancedOrder = {
    parameters: apiOrder.protocol_data.parameters,
    numerator: BigNumber.from('1'),
    denominator: BigNumber.from('1'),
    signature: apiOrder.protocol_data.signature,
    extraData: '0x00',
  }
  const value = calculateValue(apiOrder.protocol_data.parameters.consideration)
  return { advancedOrder, value }
}

function calculateValue(considerations: ConsiderationItem[]): BigNumber {
  return considerations.reduce(
    (amt: BigNumber, consideration: ConsiderationItem) => amt.add(consideration.startAmount),
    expandTo18DecimalsBN(0)
  )
}

describe('Seaport', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let covenContract: Contract
  let planner: RouterPlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
    planner = new RouterPlanner()
  })

  afterEach(async () => {
    await resetFork()
  })

  it('completes a fulfillOrder type', async () => {
    const gasPrice = BigNumber.from(2000000000000)
    const gasLimit = '10000000'
    const { order, value } = getOrderParams(seaportOrders[0])
    const params = order.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillOrder', [order, OPENSEA_CONDUIT_KEY])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await weirollRouter.execute(commands, state, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(weirollRouter.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('completes a fulfillAdvancedOrder type', async () => {
    const gasPrice = BigNumber.from(2000000000000)
    const gasLimit = '10000000'
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
    const receipt = await (await weirollRouter.execute(commands, state, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('gas fulfillOrder', async () => {
    const gasPrice = BigNumber.from(2000000000000)
    const gasLimit = '10000000'
    const { order, value } = getOrderParams(seaportOrders[0])
    const params = order.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillOrder', [order, OPENSEA_CONDUIT_KEY])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(weirollRouter.execute(commands, state, { value }))
  })

  it('gas fulfillAdvancedOrder', async () => {
    const gasPrice = BigNumber.from(2000000000000)
    const gasLimit = '10000000'
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
    await snapshotGasCost(weirollRouter.execute(commands, state, { value }))
  })

  it('reverts if order does not go through', async () => {
    const gasPrice = BigNumber.from(2000000000000)
    const gasLimit = '10000000'
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    advancedOrder.parameters.salt = BigNumber.from('6666666666666666')
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await expect(weirollRouter.execute(commands, state, { value, gasLimit })).to.be.revertedWith(
      'ExecutionFailed(0, "0x815e1d64")'
    )
  })
})
