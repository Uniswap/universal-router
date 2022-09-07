import JSBI from 'jsbi'
import { BigintIsh, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { encodeSqrtRatioX96, FeeAmount, nearestUsableTick, Pool, TickMath, TICK_SPACINGS } from '@uniswap/v3-sdk'
import { WETH, DAI, USDC } from './mainnetForkHelpers'

const feeAmount = FeeAmount.MEDIUM
const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
const liquidity = 1_000_000

// v3
export const makePool = (token0: Token, token1: Token, liquidity: number) => {
  return new Pool(token0, token1, feeAmount, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
    {
      index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: liquidity,
      liquidityGross: liquidity,
    },
    {
      index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: -liquidity,
      liquidityGross: liquidity,
    },
  ])
}

// v2
export const makePair = (token0: Token, token1: Token, liquidity: BigintIsh) => {
  const amount0 = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(liquidity))
  const amount1 = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(liquidity))

  return new Pair(amount0, amount1)
}

export const pool_DAI_WETH = makePool(DAI, WETH, liquidity)
export const pair_USDC_WETH = makePair(USDC, WETH, liquidity)
export const pair_DAI_WETH = makePair(DAI, WETH, liquidity)

const FEE_SIZE = 3

export function encodePath(path: string[], fees: FeeAmount[]): string {
  if (path.length != fees.length + 1) {
    throw new Error('path/fee lengths do not match')
  }

  let encoded = '0x'
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, '0')
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2)

  return encoded.toLowerCase()
}
