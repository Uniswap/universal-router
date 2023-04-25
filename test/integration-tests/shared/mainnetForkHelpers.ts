import { ERC721, ERC1155, ERC20, ERC20__factory } from '../../../typechain'
import { abi as ERC721_ABI } from '../../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC1155_ABI } from '../../../artifacts/solmate/src/tokens/ERC1155.sol/ERC1155.json'
import CRYPTOPUNKS_ABI from './abis/Cryptopunks.json'
import {
  ALPHABETTIES_ADDRESS,
  CAMEO_ADDRESS,
  COVEN_ADDRESS,
  ENS_NFT_ADDRESS,
  MENTAL_WORLDS_ADDRESS,
  TWERKY_ADDRESS,
  CRYPTOPUNKS_MARKET_ADDRESS,
  DECENTRA_DRAGON_ADDRESS,
  TOWNSTAR_ADDRESS,
  MILADY_ADDRESS,
} from './constants'
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

export const resetFork = async (block: number = 15360000) => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          blockNumber: block,
        },
      },
    ],
  })
}

export const COVEN_721 = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI) as ERC721
export const DRAGON_721 = new ethers.Contract(DECENTRA_DRAGON_ADDRESS, ERC721_ABI) as ERC721
export const MILADY_721 = new ethers.Contract(MILADY_ADDRESS, ERC721_ABI) as ERC721
export const ENS_721 = new ethers.Contract(ENS_NFT_ADDRESS, ERC721_ABI) as ERC721
export const MENTAL_WORLDS_721 = new ethers.Contract(MENTAL_WORLDS_ADDRESS, ERC721_ABI) as ERC721
export const ALPHABETTIES_721 = new ethers.Contract(ALPHABETTIES_ADDRESS, ERC721_ABI) as ERC721
export const TWERKY_1155 = new ethers.Contract(TWERKY_ADDRESS, ERC1155_ABI) as ERC1155
export const CAMEO_1155 = new ethers.Contract(CAMEO_ADDRESS, ERC1155_ABI) as ERC1155
export const TOWNSTAR_1155 = new ethers.Contract(TOWNSTAR_ADDRESS, ERC1155_ABI) as ERC1155
export const CRYPTOPUNKS_MARKET = new ethers.Contract(CRYPTOPUNKS_MARKET_ADDRESS, CRYPTOPUNKS_ABI)
