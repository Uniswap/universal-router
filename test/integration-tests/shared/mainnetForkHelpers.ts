import { ERC721 } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { abi as ERC721_ABI } from '../../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { COVEN_ADDRESS } from './constants'
import { abi as V2_PAIR_ABI } from '../../../artifacts/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol/IUniswapV2Pair.json'
import { Currency, Token, WETH9 } from '@uniswap/sdk-core'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants, Contract as EthersContract } from 'ethers'
import hre from 'hardhat'
import { MethodParameters } from '@uniswap/v3-sdk'
import { Pair } from '@uniswap/v2-sdk'
const { ethers } = hre

export const WETH = WETH9[1]
export const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'Dai Stablecoin')
export const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD//C')
export const USDT = new Token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT', 'Tether USD')
export const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
export const V2_FACTORY = 0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f

const approveToken = async (alice: SignerWithAddress, approveTarget: string, currency: Currency) => {
  if (currency.isToken) {
    // const aliceTokenIn: Erc20 = Erc20__factory.connect(currency.address, alice);
    const aliceTokenIn = new ethers.Contract(currency.address, TOKEN_ABI, alice) as EthersContract

    if (currency.symbol == 'USDT') {
      await (await aliceTokenIn.approve(approveTarget, 0)).wait()
    }

    await (await aliceTokenIn.approve(approveTarget, constants.MaxUint256)).wait()
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

export const executeSwap = async (
  methodParameters: MethodParameters,
  tokenIn: Currency,
  tokenOut: Currency,
  alice: SignerWithAddress
): Promise<TransactionReceipt> => {
  if (tokenIn.symbol == tokenOut.symbol) throw 'Cannot trade token for itself'
  await approveToken(alice, SWAP_ROUTER_V2, tokenIn)

  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_V2,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: BigNumber.from(2000000000000),
    type: 1,
  }

  let transactionResponse = await alice.sendTransaction(transaction)
  const receipt = await transactionResponse.wait()
  if (receipt.status != 1) throw 'transaction failed'

  return receipt
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

export const COVEN_NFT = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI) as ERC721
export const DYSTOMICE_NFT = new ethers.Contract('0xe440654A00B757446B4914C56aD56A804a6BC6af', ERC721_ABI) as ERC721
