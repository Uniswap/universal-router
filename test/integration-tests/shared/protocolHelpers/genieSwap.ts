import { BigNumber } from 'ethers'
import GENIE_SWAP_ABI from '../abis/genie/GenieSwap.json'
import GENIE_X2Y2_MARKET_ABI from '../abis/genie/GenieX2Y2Market.json'
import hre from 'hardhat'
const { ethers } = hre

export const genieInterface = new ethers.utils.Interface(GENIE_SWAP_ABI)
export const genieX2Y2MarketInterface = new ethers.utils.Interface(GENIE_X2Y2_MARKET_ABI)

export type GenieSwapInput = {
  erc20Details: any[]
  erc721Details: any[]
  erc1155Details: any[]
  conversionDetails: any[]
  tradeDetails: TradeDetails[]
  dustTokens: string[]
  feeDetails: number[]
}

export type TradeDetails = {
  marketId: number
  value: number | BigNumber
  tradeData: string
}
