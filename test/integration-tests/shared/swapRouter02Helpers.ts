import JSBI from 'jsbi'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigintIsh, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { encodeSqrtRatioX96, FeeAmount, nearestUsableTick, Pool, TickMath, TICK_SPACINGS } from '@uniswap/v3-sdk'
import { getV2PoolReserves, WETH, DAI, USDC, USDT } from './mainnetForkHelpers'
import { BigNumber } from 'ethers'

const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
const liquidity = 1_000_000

// v3
export const makePool = (token0: Token, token1: Token, liquidity: number) => {
  const feeTier = getFeeTier(token0.address, token1.address)
  return new Pool(token0, token1, feeTier, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
    {
      index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeTier]),
      liquidityNet: liquidity,
      liquidityGross: liquidity,
    },
    {
      index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeTier]),
      liquidityNet: -liquidity,
      liquidityGross: liquidity,
    },
  ])
}

export function getFeeTier(tokenA: string, tokenB: string): FeeAmount {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]

  if (token0 == DAI.address && token1 == WETH.address) return FeeAmount.MEDIUM
  if (token0 == USDC.address && token1 == WETH.address) return FeeAmount.LOW
  if (token0 == WETH.address && token1 == USDT.address) return FeeAmount.LOW
  if (token0 == DAI.address && token1 == USDC.address) return FeeAmount.LOWEST
  if (token0 == DAI.address && token1 == USDT.address) return FeeAmount.LOWEST
  if (token0 == USDC.address && token1 == USDT.address) return FeeAmount.LOWEST
  else return FeeAmount.MEDIUM
}

export const pool_DAI_WETH = makePool(DAI, WETH, liquidity)
export const pool_DAI_USDC = makePool(USDC, DAI, liquidity)
export const pool_USDC_WETH = makePool(USDC, WETH, liquidity)
export const pool_USDC_USDT = makePool(USDC, USDT, liquidity)
export const pool_DAI_USDT = makePool(DAI, USDT, liquidity)
export const pool_WETH_USDT = makePool(USDT, WETH, liquidity)

// v2
export const makePair = async (alice: SignerWithAddress, token0: Token, token1: Token) => {
  const reserves = await getV2PoolReserves(alice, token0, token1)
  let reserve0: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(reserves.reserve0))
  let reserve1: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(reserves.reserve1))

  return new Pair(reserve0, reserve1)
}

const FEE_SIZE = 3

// v3
export function encodePath(path: string[]): string {
  let encoded = '0x'
  for (let i = 0; i < path.length - 1; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += getFeeTier(path[i], path[i + 1])
      .toString(16)
      .padStart(2 * FEE_SIZE, '0')
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2)

  return encoded.toLowerCase()
}

export function encodePathExactInput(tokens: string[]): string {
  return encodePath(tokens)
}

export function encodePathExactOutput(tokens: string[]): string {
  return encodePath(tokens.slice().reverse())
}

export function expandTo18Decimals(n: number): BigintIsh {
  return JSBI.BigInt(BigNumber.from(n).mul(BigNumber.from(10).pow(18)).toString())
}
