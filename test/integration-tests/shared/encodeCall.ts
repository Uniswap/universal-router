import { ethers } from 'ethers'
import { BigNumber } from 'ethers'

const permitSignature = 'permit(address,uint256,uint256,uint8,bytes32,bytes32)'
const decreaseLiquidityFunctionSignature = 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))'
const collectFunctionSignature = 'collect((uint256,address,uint128,uint128))'
const burnFunctionSignature = 'burn(uint256)'

const modifyLiquiditiesSignature = 'modifyLiquidities(bytes,uint256)'

const permitSignatureV4 = 'permit(address,uint256,uint256,uint256,bytes)'

const initializePoolSignature = 'initializePool((address,address,uint24,int24,address),uint160,bytes)'

const DECREASE_LIQUIDITY_STRUCT =
  '(uint256 tokenId,uint256 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)'
const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max,uint256 amount1Max)'
const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

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

interface ERC721PermitParamsV4 {
  spender: string
  tokenId: ethers.BigNumber
  deadline: string
  signature: string
  nonce: number
}

interface InitializePoolParams {
  key: {
    currency0: string
    currency1: string
    fee: number
    tickSpacing: number
    hooks: string
  }
  sqrtPriceX96: BigNumber
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

const encodeERC721PermitV4 = (params: ERC721PermitParamsV4): string => {
  const abi = new ethers.utils.AbiCoder()
  const { spender, tokenId, deadline, nonce, signature } = params
  const encodedParams = abi.encode(
    ['address', 'uint256', 'uint256', 'uint256', 'bytes'],
    [spender, tokenId, deadline, nonce, signature]
  )
  const functionSignature = ethers.utils.id(permitSignatureV4).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeInitializePool = (params: InitializePoolParams): string => {
  const abi = new ethers.utils.AbiCoder()
  const { key, sqrtPriceX96, hookData } = params
  const encodedParams = abi.encode([POOL_KEY_STRUCT, 'uint160', 'bytes'], [key, sqrtPriceX96, hookData])
  const functionSignature = ethers.utils.id(initializePoolSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

export {
  encodeERC721Permit,
  encodeDecreaseLiquidity,
  encodeCollect,
  encodeBurn,
  encodeModifyLiquidities,
  encodeERC721PermitV4,
  encodeInitializePool,
}
