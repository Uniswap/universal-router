import hre from 'hardhat'
const { ethers } = hre
import LOOKS_RARE_V2_ABI from '../abis/LooksRareV2.json'
import fs from 'fs'

export const looksRareV2Orders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/LooksRareV2.json', { encoding: 'utf8' })
)
export const looksRareV2Interface = new ethers.utils.Interface(LOOKS_RARE_V2_ABI)

// CollectionType
export const LOOKS_RARE_V2_721_ORDER = 0
export const LOOKS_RARE_V2_1155_ORDER = 1

// QuoteType
export const LOOKS_RARE_V2_BID = 0
export const LOOKS_RARE_V2_ASK = 1

export type MakerOrder = {
  quoteType: number
  globalNonce: number
  subsetNonce: number
  orderNonce: number
  strategyId: number
  collectionType: number
  collection: string
  currency: string
  signer: string
  startTime: number
  endTime: number
  price: number
  itemIds: number[]
  amounts: number[]
  additionalParameters: string
}

export type TakerOrder = {
  recipient: string
  additionalParameters: string
}

export const LOOKS_RARE_V2_TREE_LEFT = 0
export const LOOKS_RARE_V2_TREE_RIGHT = 1

export type MerkeTree = {
  root: string
  proof: {
    value: string
    position: number
  }[]
}
