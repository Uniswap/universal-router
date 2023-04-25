import hre from 'hardhat'
import { BigNumber } from 'ethers'
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
  globalNonce: string
  subsetNonce: string
  orderNonce: string
  strategyId: number
  collectionType: number
  collection: string
  currency: string
  signer: string
  startTime: number
  endTime: number
  price: string
  itemIds: string[]
  amounts: string[]
  additionalParameters: string
}

export type TakerOrder = {
  recipient: string
  additionalParameters: string
}

export const LOOKS_RARE_V2_TREE_LEFT = 0
export const LOOKS_RARE_V2_TREE_RIGHT = 1

export type MerkleProof = {
  value: string
  position: number
}

export type MerkleTree = {
  root: string
  proof: MerkleProof[]
}

export type LRV2APIOrder = MakerOrder & {
  id: string
  hash: string
  signature: string
  createdAt: string
  merkleRoot: string
  merkleProof: MerkleProof[]
}

export function createLooksRareV2Order(
  apiOrder: LRV2APIOrder,
  taker: string
): {
  takerBid: TakerOrder
  makerOrder: MakerOrder
  makerSignature: string
  value: BigNumber
  merkleTree: MerkleTree
} {
  const makerOrder: MakerOrder = { ...apiOrder }

  const makerSignature: string = apiOrder.signature

  const takerBid: TakerOrder = {
    recipient: taker,
    additionalParameters: '0x',
  }

  const value: BigNumber = BigNumber.from(apiOrder.price)

  const merkleTree: MerkleTree = {
    root: apiOrder.merkleRoot,
    proof: apiOrder.merkleProof,
  }

  return { takerBid, makerOrder, makerSignature, value, merkleTree }
}

export function createLooksRareV2Orders(
  apiOrders: LRV2APIOrder[],
  taker: string
): {
  takerBids: TakerOrder[]
  makerOrders: MakerOrder[]
  makerSignatures: string[]
  totalValue: BigNumber
  merkleTrees: MerkleTree[]
} {
  let takerBids: TakerOrder[] = []
  let makerOrders: MakerOrder[] = []
  let makerSignatures: string[] = []
  let totalValue: BigNumber = BigNumber.from(0)
  let merkleTrees: MerkleTree[] = []

  apiOrders.forEach((apiOrder) => {
    const { takerBid, makerOrder, makerSignature, value, merkleTree } = createLooksRareV2Order(apiOrder, taker)
    takerBids.push(takerBid)
    makerOrders.push(makerOrder)
    makerSignatures.push(makerSignature)
    totalValue = totalValue.add(value)
    merkleTrees.push(merkleTree)
  })

  return { takerBids, makerOrders, makerSignatures, totalValue, merkleTrees }
}
