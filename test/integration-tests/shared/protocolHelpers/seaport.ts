import SEAPORT_ABI from '../abis/Seaport.json'
import { BigNumber } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'
import fs from 'fs'
import hre from 'hardhat'
import { OPENSEA_CONDUIT_KEY } from '../constants'
const { ethers } = hre

export const seaportOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/Seaport.json', { encoding: 'utf8' })
)
export const seaportInterface = new ethers.utils.Interface(SEAPORT_ABI)

export type OfferItem = {
  itemType: BigNumber // enum
  token: string // address
  identifierOrCriteria: BigNumber
  startAmount: BigNumber
  endAmount: BigNumber
}

export type ConsiderationItem = OfferItem & {
  recipient: string
}

export type OrderParameters = {
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

export type Order = {
  parameters: OrderParameters
  signature: string
}

export type AdvancedOrder = Order & {
  numerator: BigNumber // uint120
  denominator: BigNumber // uint120
  extraData: string // bytes
}

export function getOrderParams(apiOrder: any): { order: Order; value: BigNumber } {
  delete apiOrder.protocol_data.parameters.counter
  const order = {
    parameters: apiOrder.protocol_data.parameters,
    signature: apiOrder.protocol_data.signature,
  }
  const value = calculateValue(apiOrder.protocol_data.parameters.consideration)
  return { order, value }
}

export function getAdvancedOrderParams(apiOrder: any): { advancedOrder: AdvancedOrder; value: BigNumber } {
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

export function calculateValue(considerations: ConsiderationItem[]): BigNumber {
  return considerations.reduce(
    (amt: BigNumber, consideration: ConsiderationItem) => amt.add(consideration.startAmount),
    expandTo18DecimalsBN(0)
  )
}

export function defaultAvailableAdvancedOrders(
  address: string,
  advancedOrder0: AdvancedOrder,
  advancedOrder1: AdvancedOrder
): string {
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
    address,
    100,
  ])

  return calldata
}
