import { BigNumber } from 'ethers'
import hre from 'hardhat'
const { ethers } = hre
import LOOKS_RARE_ABI from './../../shared/abis/LooksRare.json'
import fs from 'fs'

export const looksRareOrders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/LooksRare.json', { encoding: 'utf8' })
)
export const looksRareInterface = new ethers.utils.Interface(LOOKS_RARE_ABI)

export const LOOKS_RARE_721_ORDER = 0
export const LOOKS_RARE_1155_ORDER = 2

export type APIOrder = Omit<MakerOrder, 'collection' | 'currency'> & {
  collectionAddress: string
  currencyAddress: string
}

export type MakerOrder = {
  collection: string
  tokenId: BigNumber
  isOrderAsk: true
  signer: string
  strategy: string
  currency: string
  amount: BigNumber
  price: BigNumber
  minPercentageToAsk: BigNumber
  nonce: BigNumber
  startTime: BigNumber
  endTime: BigNumber
  v: BigNumber
  r: string
  s: string
  params: string
}

export type TakerOrder = {
  minPercentageToAsk: BigNumber
  price: BigNumber
  taker: string
  tokenId: BigNumber
  isOrderAsk: boolean
  params: string
}

export function createLooksRareOrders(
  apiOrder: APIOrder,
  taker: string
): { makerOrder: MakerOrder; takerOrder: TakerOrder; value: BigNumber } {
  const collection = apiOrder.collectionAddress
  const currency = apiOrder.currencyAddress
  if (apiOrder.params == '') apiOrder.params = '0x'

  const makerOrder = { ...apiOrder, collection, currency }

  const takerOrder = {
    minPercentageToAsk: apiOrder.minPercentageToAsk,
    price: apiOrder.price,
    taker,
    tokenId: apiOrder.tokenId,
    isOrderAsk: false,
    params: apiOrder.params,
  }

  const value = BigNumber.from(apiOrder.price)

  return { makerOrder, takerOrder, value }
}
