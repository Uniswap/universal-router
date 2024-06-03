import { BigNumber } from 'ethers'
import bn from 'bignumber.js'
import { FeeAmount } from '@uniswap/v3-sdk'
import { encodePath } from './swapRouter02Helpers'

export function expandTo18DecimalsBN(n: number): BigNumber {
  // use bn intermediately to allow decimals in intermediate calculations
  return BigNumber.from(new bn(n).times(new bn(10).pow(18)).toFixed())
}

export function expandTo6DecimalsBN(n: number): BigNumber {
  // use bn intermediately to allow decimals in intermediate calculations
  return BigNumber.from(new bn(n).times(new bn(10).pow(6)).toFixed())
}

export function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

export function encodePathExactOutput(tokens: string[], feeTier: FeeAmount = FeeAmount.MEDIUM) {
  return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(feeTier))
}
