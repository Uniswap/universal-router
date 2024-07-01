import { ethers } from 'ethers'
import { BigNumber } from 'ethers'

const decreaseLiquidityFunctionSignature = 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))'
const collectFunctionSignature = 'collect((uint256,address,uint128,uint128))'
const burnFunctionSignature = 'burn(uint256)'

const DECREASE_LIQUIDITY_STRUCT =
  '(uint256 tokenId,uint256 liquidity,uint256 amount0Min,uint256 amount1Min, uint256 deadline)'
const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max,uint256 amount1Max)'

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

export { encodeDecreaseLiquidity, encodeCollect, encodeBurn }
