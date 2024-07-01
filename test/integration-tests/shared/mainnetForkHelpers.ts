import { ERC20, ERC20__factory, IPermit2, INonfungiblePositionManager } from '../../../typechain'
import { abi as PERMIT2_ABI } from '../../../artifacts/permit2/src/interfaces/IPermit2.sol/IPermit2.json'
import { abi as INonfungiblePositionManager_ABI } from '../../../artifacts/@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json'
import { PERMIT2_ADDRESS, V3_NFT_POSITION_MANAGER_MAINNET } from './constants'
import { abi as V2_PAIR_ABI } from '../../../artifacts/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol/IUniswapV2Pair.json'
import { Currency, Token, WETH9 } from '@uniswap/sdk-core'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants } from 'ethers'
import hre from 'hardhat'
import { MethodParameters } from '@uniswap/v3-sdk'
import { Pair } from '@uniswap/v2-sdk'
const { ethers } = hre

export const WETH = WETH9[1]
export const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'Dai Stablecoin')
export const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD//C')
export const USDT = new Token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT', 'Tether USD')
export const GALA = new Token(1, '0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA', 8, 'GALA', 'Gala')
export const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
export const V2_FACTORY = 0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f

export const approveSwapRouter02 = async (
  alice: SignerWithAddress,
  currency: Currency,
  overrideSwapRouter02Address?: string
) => {
  if (currency.isToken) {
    const aliceTokenIn: ERC20 = ERC20__factory.connect(currency.address, alice)

    if (currency.symbol == 'USDT') {
      await (await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_V2, 0)).wait()
    }

    return await (
      await aliceTokenIn.approve(overrideSwapRouter02Address ?? SWAP_ROUTER_V2, constants.MaxUint256)
    ).wait()
  }
}

type Reserves = {
  reserve0: BigNumber
  reserve1: BigNumber
}

export const getV2PoolReserves = async (alice: SignerWithAddress, tokenA: Token, tokenB: Token): Promise<Reserves> => {
  const contractAddress = Pair.getAddress(tokenA, tokenB)
  const contract = new ethers.Contract(contractAddress, V2_PAIR_ABI, alice)

  const { reserve0, reserve1 } = await contract.getReserves()
  return { reserve0, reserve1 }
}

export const approveAndExecuteSwapRouter02 = async (
  methodParameters: MethodParameters,
  tokenIn: Currency,
  tokenOut: Currency,
  alice: SignerWithAddress
): Promise<TransactionResponse> => {
  if (tokenIn.symbol == tokenOut.symbol) throw 'Cannot trade token for itself'
  await approveSwapRouter02(alice, tokenIn)

  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_V2,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: BigNumber.from(2000000000000),
    type: 1,
  }

  const transactionResponse = await alice.sendTransaction(transaction)
  return transactionResponse
}

export const executeSwapRouter02Swap = async (
  methodParameters: MethodParameters,
  alice: SignerWithAddress
): Promise<TransactionResponse> => {
  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_V2,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: BigNumber.from(2000000000000),
    type: 1,
  }

  const transactionResponse = await alice.sendTransaction(transaction)
  return transactionResponse
}

export const resetFork = async () => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          blockNumber: 20010000,
        },
      },
    ],
  })
}

export const PERMIT2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI) as IPermit2

export const V3_NFT_POSITION_MANAGER = new ethers.Contract(
  V3_NFT_POSITION_MANAGER_MAINNET,
  INonfungiblePositionManager_ABI
) as INonfungiblePositionManager
