import { ethers } from 'ethers'
import { BigNumber } from 'ethers'

const permitSignature = 'permit(address,uint256,uint256,uint8,bytes32,bytes32)'
const decreaseLiquidityFunctionSignature = 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))'
const collectFunctionSignature = 'collect((uint256,address,uint128,uint128))'
const burnFunctionSignature = 'burn(uint256)'

const modifyLiquiditiesSignature = 'modifyLiquidities(bytes,uint256)'

const DECREASE_LIQUIDITY_STRUCT =
  '(uint256 tokenId,uint256 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)'
const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max,uint256 amount1Max)'

interface ERC721PermitParams {
  spender: string
  tokenId: ethers.BigNumber
  deadline: string
  v: number
  r: string
  s: string
}

interface DecreaseLiquidityParams {
  tokenId: ethers.BigNumber
  liquidity: ethers.BigNumber
  amount0Min: number
  amount1Min: number
  deadline: string
}

interface CollectParams {
  tokenId: ethers.BigNumber
  recipient: string
  amount0Max: string
  amount1Max: string
}

interface ModifyLiquiditiesParams {
  unlockData: string
  deadline: string
}

interface UnlockDataParams {
  actions: number[]
  unlockParams: string[]
}

interface PoolKey {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  IHooks: string
}

interface LiquidityRange {
  PoolKey: PoolKey
  tickLower: number
  tickUpper: number
}

interface MintParams {
  LiquidityRange: LiquidityRange
  liquidity: string
  owner: string
  hookData: string
}

interface IncreaseParams {
  tokenId: number
  LiquidityRange: LiquidityRange
  liquidity: string
  hookData: string
}

const encodeERC721Permit = (params: ERC721PermitParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { spender, tokenId, deadline, v, r, s } = params
  const encodedParams = abi.encode(
    ['address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
    [spender, tokenId, deadline, v, r, s]
  )
  const functionSignature = ethers.utils.id(permitSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeDecreaseLiquidity = (params: DecreaseLiquidityParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const encodedParams = abi.encode([DECREASE_LIQUIDITY_STRUCT], [params])
  const functionSignature = ethers.utils.id(decreaseLiquidityFunctionSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeCollect = (params: CollectParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const encodedCollectParams = abi.encode([COLLECT_STRUCT], [params])
  const functionSignatureCollect = ethers.utils.id(collectFunctionSignature).substring(0, 10)
  const encodedCollectCall = functionSignatureCollect + encodedCollectParams.substring(2)
  return encodedCollectCall
}

const encodeBurn = (params: BigNumber): string => {
  const abi = new ethers.utils.AbiCoder()
  const encodedBurnParams = abi.encode(['uint256'], [params])
  const functionSignatureBurn = ethers.utils.id(burnFunctionSignature).substring(0, 10)
  const encodedBurnCall = functionSignatureBurn + encodedBurnParams.substring(2)
  return encodedBurnCall
}

const encodeModifyLiquidities = (params: ModifyLiquiditiesParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { unlockData, deadline } = params
  const encodedParams = abi.encode(['bytes', 'uint256'], [unlockData, deadline])
  const functionSignature = ethers.utils.id(modifyLiquiditiesSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeUnlockData = (params: UnlockDataParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { actions, unlockParams } = params
  const encodedParams = abi.encode(['uint8[]', 'bytes[]'], [actions, unlockParams])
  return encodedParams
}

const encodeMintData = (params: MintParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { LiquidityRange, liquidity, owner, hookData } = params
  const encodedParams = abi.encode(
    ['tuple(tuple(address,address,uint24,int24,address),int24,int24)', 'uint256', 'address', 'bytes'],
    [
      [
        [
          LiquidityRange.PoolKey.currency0,
          LiquidityRange.PoolKey.currency1,
          LiquidityRange.PoolKey.fee,
          LiquidityRange.PoolKey.tickSpacing,
          LiquidityRange.PoolKey.IHooks,
        ],
        LiquidityRange.tickLower,
        LiquidityRange.tickUpper,
      ],
      liquidity,
      owner,
      hookData,
    ]
  )
  return encodedParams
}

const encodeIncreaseData = (params: IncreaseParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { tokenId, LiquidityRange, liquidity, hookData } = params
  const encodedParams = abi.encode(
    ['uint256', 'tuple(tuple(address,address,uint24,int24,address),int24,int24)', 'uint256', 'bytes'],
    [
      tokenId,
      [
        [
          LiquidityRange.PoolKey.currency0,
          LiquidityRange.PoolKey.currency1,
          LiquidityRange.PoolKey.fee,
          LiquidityRange.PoolKey.tickSpacing,
          LiquidityRange.PoolKey.IHooks,
        ],
        LiquidityRange.tickLower,
        LiquidityRange.tickUpper,
      ],
      liquidity,
      hookData,
    ]
  )
  return encodedParams
}

const encodeSettleBalance = (currency: string, amt: string): string => {
  const abi = new ethers.utils.AbiCoder()
  const encodedParams = abi.encode(['address', 'uint256'], [currency, amt])
  return encodedParams
}

const encodeERC20To = (currency: string, to: string): string => {
  const abi = new ethers.utils.AbiCoder()
  const encodedParams = abi.encode(['address', 'address'], [currency, to])
  return encodedParams
}

export {
  encodeERC721Permit,
  encodeDecreaseLiquidity,
  encodeCollect,
  encodeBurn,
  encodeModifyLiquidities,
  encodeUnlockData,
  encodeMintData,
  encodeIncreaseData,
  encodeSettleBalance,
  encodeERC20To,
}
