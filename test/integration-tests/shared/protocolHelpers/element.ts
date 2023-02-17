import ELEMENT_721_ABI from '../abis/Element.json'
import { BigNumber } from 'ethers'
import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const element721Orders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/Element.json', { encoding: 'utf8' })
).data.orders

export const element721Interface = new ethers.utils.Interface(ELEMENT_721_ABI)

export type ElementOrderSignature = {
  signatureType: number // 0 for 721 and 1 for presigned
  v: number
  r: string
  s: string
}

export interface Fee {
  recipient: string
  amount: string
  feeData: string
}

export const EXAMPLE_ETH_SELL_ORDER: NFTSellOrder = {
  maker: '0xABd6a19345943dD175026Cdb52902FD3392a3262',
  taker: '0x75B6568025f463a98fB01082eEb6dCe04efA3Ae4',
  expiry: '7199994275163324196',
  nonce: '3',
  erc20Token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  erc20TokenAmount: '55000000000000000',
  fees: [],
  nft: '0x4C69dBc3a2Aa3476c3F7a1227ab70950DB1F4858',
  nftId: '998',
}

export const EXAMPLE_ETH_SELL_ORDER_SIG: ElementOrderSignature = {
  signatureType: 0,
  v: 27,
  r: '0x59ceb2bc0e21029209e6cfa872b1224631b01da3e19d25fad9b929b8be4e6f60',
  s: '0x72cadb8ed8a5bf5938829f888ff60c9ebe163954dc15af3e5d6014e8f6801b83',
}

export interface NFTSellOrder {
  maker: string
  taker: string
  expiry: string
  nonce: string
  erc20Token: string
  erc20TokenAmount: string
  fees: Fee[]
  nft: string
  nftId: string
}

export interface ERC1155SellOrder {
  maker: string
  taker: string
  expiry: string
  nonce: string
  erc20Token: string
  erc20TokenAmount: string
  fees: Fee[]
  erc1155Token: string
  erc1155TokenId: string
  erc1155TokenAmount: string
}

export type ExchangeData = {
  basicCollections: [
    {
      nftAddress: string
      platformFee: number
      royaltyFeeRecipient: string
      royaltyFee: number
      items: [
        {
          erc20TokenAmount: string
          nftId: string
        }
      ]
    }
  ]
  collections: null
  startNonce: number
  nonce: number
  hashNonce: string
  platformFeeRecipient: string
  v: number
  r: string
  s: string
  listingTime: number
  expirationTime: number
  maker: string
  hash: string
  paymentToken: string
}

export function getOrder(apiOrder: any): { order: NFTSellOrder; signature: ElementOrderSignature; value: BigNumber } {
  const exchangeData: ExchangeData = JSON.parse(apiOrder.exchangeData)

  const value = BigNumber.from(exchangeData.basicCollections[0].items[0].erc20TokenAmount)

  const order = {
    maker: apiOrder.maker,
    taker: apiOrder.taker,
    expiry: apiOrder.expirationTime,
    nonce: String(exchangeData.nonce),
    erc20Token: apiOrder.paymentToken,
    erc20TokenAmount: value.toString(),
    fees: [], // TODO: add support for calculating fees from api order
    nft: apiOrder.contractAddress,
    nftId: apiOrder.tokenId,
  }
  const signature = {
    signatureType: 0,
    v: exchangeData.v,
    r: exchangeData.r,
    s: exchangeData.s,
  }
  return { order, signature, value }
}
