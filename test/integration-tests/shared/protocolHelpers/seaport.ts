import SEAPORT_ABI from '../abis/Seaport.json'
import { BigNumber, BigNumberish } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'
import { OPENSEA_CONDUIT_KEY } from '../constants'
import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const seaportOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/Seaport.json', { encoding: 'utf8' })
)
export const seaportInterface = new ethers.utils.Interface(SEAPORT_ABI)

export enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
  ERC721_WITH_CRITERIA = 4,
  ERC1155_WITH_CRITERIA = 5,
}

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

export enum Side {
  OFFER,
  CONSIDERATION,
}

export type CriteriaResovler = {
  rderIndex: BigNumber
  side: Side // enum
  index: BigNumber
  identifier: BigNumber
  criteriaProof: string[] // bytes32[]
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

// TODO: type criteriaResolvers
export function getAdvancedOrderParams(apiOrder: any): {
  advancedOrder: AdvancedOrder
  criteriaResolvers: CriteriaResovler[]
} {
  delete apiOrder.protocol_data.parameters.counter
  const advancedOrder = {
    parameters: apiOrder.protocol_data.parameters,
    numerator: BigNumber.from('1'),
    denominator: BigNumber.from('1'),
    signature: apiOrder.protocol_data.signature,
    extraData: '0x00',
  }
  // TODO: this may not fit the actual schema of the OS apiOrder. Verify after get access
  const criteriaResolvers =
    'criteriaResolvers' in apiOrder.protocol_data ? apiOrder.protocol_data.criteriaResolvers : []
  return { advancedOrder, criteriaResolvers }
}

// TODO: add another helper to calculate when we are receiving the offer and the consideration is subtracted from offer
export function calculateValue(considerations: ConsiderationItem[], itemTypes?: ItemType[]): BigNumber {
  if (itemTypes) {
    // filter out all consideration items not in itemTypes
    considerations = considerations.filter((consideration: ConsiderationItem) =>
      itemTypes.includes(BigNumber.from(consideration.itemType).toNumber())
    )
  }
  return considerations.reduce(
    (amt: BigNumber, consideration: ConsiderationItem) => amt.add(consideration.startAmount),
    expandTo18DecimalsBN(0)
  )
}

type BuyCovensReturnData = {
  calldata: string
  advancedOrder0: AdvancedOrder
  advancedOrder1: AdvancedOrder
  value: BigNumberish
}

export function purchaseDataForTwoCovensSeaport(receipient: string): BuyCovensReturnData {
  const { advancedOrder: advancedOrder0 } = getAdvancedOrderParams(seaportOrders[0])
  const value1 = calculateValue(advancedOrder0.parameters.consideration)
  const { advancedOrder: advancedOrder1 } = getAdvancedOrderParams(seaportOrders[1])
  const value2 = calculateValue(advancedOrder0.parameters.consideration)
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
    receipient,
    100,
  ])
  return { calldata, advancedOrder0, advancedOrder1, value }
}
