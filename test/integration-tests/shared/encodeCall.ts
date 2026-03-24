import { AbiCoder, id } from 'ethers'

const permitSignature = 'permit(address,uint256,uint256,uint8,bytes32,bytes32)'
const decreaseLiquidityFunctionSignature = 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))'
const collectFunctionSignature = 'collect((uint256,address,uint128,uint128))'
const burnFunctionSignature = 'burn(uint256)'

const modifyLiquiditiesSignature = 'modifyLiquidities(bytes,uint256)'

const permitSignatureV4 = 'permit(address,uint256,uint256,uint256,bytes)'

const DECREASE_LIQUIDITY_STRUCT =
  '(uint256 tokenId,uint256 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)'
const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max,uint256 amount1Max)'

interface ERC721PermitParams {
  spender: string
  tokenId: bigint
  deadline: string
  v: number
  r: string
  s: string
}

interface DecreaseLiquidityParams {
  tokenId: bigint
  liquidity: bigint
  amount0Min: number
  amount1Min: number
  deadline: string
}

interface CollectParams {
  tokenId: bigint
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
  tokenId: bigint
  deadline: string
  signature: string
  nonce: number
}

const encodeERC721Permit = (params: ERC721PermitParams): string => {
  const abi = new AbiCoder()
  const { spender, tokenId, deadline, v, r, s } = params
  const encodedParams = abi.encode(
    ['address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
    [spender, tokenId, deadline, v, r, s]
  )
  const functionSignature = id(permitSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeDecreaseLiquidity = (params: DecreaseLiquidityParams): string => {
  const abi = new AbiCoder()
  const encodedParams = abi.encode([DECREASE_LIQUIDITY_STRUCT], [params])
  const functionSignature = id(decreaseLiquidityFunctionSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeCollect = (params: CollectParams): string => {
  const abi = new AbiCoder()
  const encodedCollectParams = abi.encode([COLLECT_STRUCT], [params])
  const functionSignatureCollect = id(collectFunctionSignature).substring(0, 10)
  const encodedCollectCall = functionSignatureCollect + encodedCollectParams.substring(2)
  return encodedCollectCall
}

const encodeBurn = (params: bigint): string => {
  const abi = new AbiCoder()
  const encodedBurnParams = abi.encode(['uint256'], [params])
  const functionSignatureBurn = id(burnFunctionSignature).substring(0, 10)
  const encodedBurnCall = functionSignatureBurn + encodedBurnParams.substring(2)
  return encodedBurnCall
}

const encodeModifyLiquidities = (params: ModifyLiquiditiesParams): string => {
  const abi = new AbiCoder()
  const { unlockData, deadline } = params
  const encodedParams = abi.encode(['bytes', 'uint256'], [unlockData, deadline])
  const functionSignature = id(modifyLiquiditiesSignature).substring(0, 10)
  const encodedCall = functionSignature + encodedParams.substring(2)
  return encodedCall
}

const encodeERC721PermitV4 = (params: ERC721PermitParamsV4): string => {
  const abi = new AbiCoder()
  const { spender, tokenId, deadline, nonce, signature } = params
  const encodedParams = abi.encode(
    ['address', 'uint256', 'uint256', 'uint256', 'bytes'],
    [spender, tokenId, deadline, nonce, signature]
  )
  const functionSignature = id(permitSignatureV4).substring(0, 10)
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
}
