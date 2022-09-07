import JSBI from 'jsbi'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { encodeSqrtRatioX96, FeeAmount, nearestUsableTick, Pool, TickMath, TICK_SPACINGS } from '@uniswap/v3-sdk'
import { getV2PoolReserves, WETH, DAI } from './mainnetForkHelpers'

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
export const makePair = async (alice: SignerWithAddress, token0: Token, token1: Token) => {
  const reserves = await getV2PoolReserves(alice, token0, token1)
  let reserve0: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(reserves.reserve0))
  let reserve1: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(reserves.reserve1))

  return new Pair(reserve0, reserve1)
}

export const pool_DAI_WETH = makePool(DAI, WETH, liquidity)
