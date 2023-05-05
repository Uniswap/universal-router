import SEAPORT_V1_4_AND_V1_5_ABI from '../abis/Seaport.json'
import { BigNumber } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'
import { OPENSEA_CONDUIT_KEY } from '../constants'
import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const seaportV1_5Orders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/SeaportV1_5.json', { encoding: 'utf8' })
)
export const seaportV1_4Orders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/SeaportV1_4.json', { encoding: 'utf8' })
)
export const seaportInterface = new ethers.utils.Interface(SEAPORT_V1_4_AND_V1_5_ABI)
// @dev 0 bytes conduit key for an order that was not sent through the OpenSea conduit
export const ZERO_CONDUIT_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000'

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

type BuyTownStarsReturnData = {
  calldata: string
  advancedOrder0: AdvancedOrder
  advancedOrder1: AdvancedOrder
  value: BigNumber
}

export function purchaseDataForTwoTownstarsSeaport(receipient: string): BuyTownStarsReturnData {
  const { advancedOrder: advancedOrder0, value: value1 } = getAdvancedOrderParams(seaportV1_5Orders[1])
  const { advancedOrder: advancedOrder1, value: value2 } = getAdvancedOrderParams(seaportV1_5Orders[2])
  const value = value1.add(value2)
  const orderFulFillment = [[{ orderIndex: '0', itemIndex: '0' }], [{ orderIndex: '1', itemIndex: '0' }]]
  const considerationFulfillment = [
    [{ orderIndex: '0', itemIndex: '0' }],
    [
      { orderIndex: '0', itemIndex: '1' },
      { orderIndex: '1', itemIndex: '1' },
    ],
    [
      { orderIndex: '0', itemIndex: '2' },
      { orderIndex: '1', itemIndex: '2' },
    ],
    [{ orderIndex: '1', itemIndex: '0' }],
  ]

  const calldata = seaportInterface.encodeFunctionData('fulfillAvailableAdvancedOrders', [
    [advancedOrder0, advancedOrder1],
    [],
    orderFulFillment,
    considerationFulfillment,
    OPENSEA_CONDUIT_KEY,
    receipient,
    100,
  ])
  return { calldata, advancedOrder0, advancedOrder1, value }
}
