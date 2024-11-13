import hre from 'hardhat'
const { ethers } = hre

import { PositionManager, PoolManager } from '../../../typechain'
import { DAI, USDC, WETH } from './mainnetForkHelpers'
import { ADDRESS_ZERO, FeeAmount } from '@uniswap/v3-sdk'
import { MAX_UINT128, MAX_UINT160, ZERO_ADDRESS } from './constants'
import { Actions, V4Planner } from './v4Planner'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import { expandTo18DecimalsBN } from './helpers'

const USDC_WETH_PRICE = BigNumber.from('1282621508889261311518273674430423')
const USDC_WETH_TICK_LOWER = 193800
const USDC_WETH_TICK_UPPER = 193900
export const USDC_WETH = {
  poolKey: {
    currency0: USDC.address,
    currency1: WETH.address,
    fee: FeeAmount.LOW,
    tickSpacing: 10,
    hooks: ZERO_ADDRESS,
  },
  price: USDC_WETH_PRICE,
  tickLower: USDC_WETH_TICK_LOWER,
  tickUpper: USDC_WETH_TICK_UPPER,
}

const DAI_USDC_PRICE = BigNumber.from('79227835492130174795940')
const DAI_USDC_TICK_LOWER = -276330
const DAI_USDC_TICK_UPPER = -276320
export const DAI_USDC = {
  poolKey: {
    currency0: DAI.address,
    currency1: USDC.address,
    fee: FeeAmount.LOWEST,
    tickSpacing: 10,
    hooks: ZERO_ADDRESS,
  },
  price: DAI_USDC_PRICE,
  tickLower: DAI_USDC_TICK_LOWER,
  tickUpper: DAI_USDC_TICK_UPPER,
}

const ETH_USDC_PRICE = BigNumber.from('4899712312116710985145008')
const ETH_USDC_TICK_UPPER = -193620
const ETH_USDC_TICK_LOWER = -194040
export const ETH_USDC = {
  poolKey: {
    currency0: ZERO_ADDRESS,
    currency1: USDC.address,
    fee: FeeAmount.LOW,
    tickSpacing: 10,
    hooks: ZERO_ADDRESS,
  },
  price: ETH_USDC_PRICE,
  tickLower: ETH_USDC_TICK_LOWER,
  tickUpper: ETH_USDC_TICK_UPPER,
}

export async function deployV4PositionManager(
  v4PoolManager: string,
  permit2: string,
  v4PositionDescriptor: string,
  weth: string
): Promise<PositionManager> {
  const positionManagerFactory = await ethers.getContractFactory('PositionManager')
  const positionManager = (await positionManagerFactory.deploy(
    v4PoolManager,
    permit2,
    50000,
    v4PositionDescriptor,
    weth
  )) as unknown as PositionManager
  return positionManager
}

export async function deployV4PoolManager(owner: string): Promise<PoolManager> {
  const poolManagerFactory = await ethers.getContractFactory('PoolManager')
  const poolManager = (await poolManagerFactory.deploy(owner)) as unknown as PoolManager
  return poolManager
}

export async function initializeV4Pool(poolManager: PoolManager, poolKey: any, sqrtPrice: BigNumber) {
  await poolManager.initialize(poolKey, sqrtPrice.toString())
}

export async function addLiquidityToV4Pool(
  positionManager: PositionManager,
  pool: any,
  liquidity: string,
  owner: SignerWithAddress
) {
  let v4Planner: V4Planner = new V4Planner()
  v4Planner.addAction(Actions.MINT_POSITION, [
    pool.poolKey,
    pool.tickLower,
    pool.tickUpper,
    liquidity,
    MAX_UINT128,
    MAX_UINT128,
    owner.address,
    '0x',
  ])
  v4Planner.addAction(Actions.CLOSE_CURRENCY, [pool.poolKey.currency0])
  v4Planner.addAction(Actions.CLOSE_CURRENCY, [pool.poolKey.currency1])

  let value
  if (pool.poolKey.currency0 == ADDRESS_ZERO) {
    value = expandTo18DecimalsBN(85)
    v4Planner.addAction(Actions.SWEEP, [ADDRESS_ZERO, owner.address])
  } else {
    value = 0
  }

  await positionManager.connect(owner).modifyLiquidities(v4Planner.finalize(), MAX_UINT160, { value })
}

export const encodeMultihopExactInPath = (poolKeys: any[], currencyIn: string): any[] => {
  let pathKeys = []
  for (let i = 0; i < poolKeys.length; i++) {
    let currencyOut = currencyIn == poolKeys[i].currency0 ? poolKeys[i].currency1 : poolKeys[i].currency0
    let pathKey = {
      intermediateCurrency: currencyOut,
      fee: poolKeys[i].fee,
      tickSpacing: poolKeys[i].tickSpacing,
      hooks: poolKeys[i].hooks,
      hookData: '0x',
    }
    pathKeys.push(pathKey)
    currencyIn = currencyOut
  }
  return pathKeys
}

export const encodeMultihopExactOutPath = (poolKeys: any[], currencyOut: string): any[] => {
  let pathKeys = []
  for (let i = poolKeys.length; i > 0; i--) {
    let currencyIn = currencyOut == poolKeys[i - 1].currency0 ? poolKeys[i - 1].currency1 : poolKeys[i - 1].currency0
    let pathKey = {
      intermediateCurrency: currencyIn,
      fee: poolKeys[i - 1].fee,
      tickSpacing: poolKeys[i - 1].tickSpacing,
      hooks: poolKeys[i - 1].hooks,
      hookData: '0x',
    }
    // unshift pushes to the beginning of the array
    pathKeys.unshift(pathKey)
    currencyOut = currencyIn
  }
  return pathKeys
}
