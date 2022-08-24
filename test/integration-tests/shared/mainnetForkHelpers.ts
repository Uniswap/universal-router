import { abi as TOKEN_ABI } from '../../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { Currency, Token, WETH9 } from '@uniswap/sdk-core'
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants, Contract as EthersContract } from 'ethers'
import hre from 'hardhat'
import {
  MethodParameters,
} from '@uniswap/v3-sdk'
const { ethers } = hre

export const WETH = WETH9[1]
export const DAI = new Token(1,'0x6B175474E89094C44Da98b954EedeAC495271d0F',18,'DAI','Dai Stablecoin');
export const USDC = new Token(1,'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD//C');
export const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'

const approveToken = async (
  alice: SignerWithAddress,
  approveTarget: string,
  currency: Currency
) => {
  if (currency.isToken) {
    // const aliceTokenIn: Erc20 = Erc20__factory.connect(currency.address, alice);
    const aliceTokenIn = new ethers.Contract(currency.address, TOKEN_ABI, alice) as EthersContract;

    if (currency.symbol == 'USDT') {
      await (await aliceTokenIn.approve(approveTarget, 0)).wait();
    }

    await (
      await aliceTokenIn.approve(approveTarget, constants.MaxUint256)
    ).wait();
  }
};

export const executeSwap = async (
  methodParameters: MethodParameters,
  tokenIn: Currency,
  tokenOut: Currency,
  alice: SignerWithAddress,
): Promise<TransactionReceipt> => {
  if (tokenIn.symbol == tokenOut.symbol) throw 'Cannot trade token for itself';
  await approveToken(
    alice,
    SWAP_ROUTER_V2,
    tokenIn
  );

  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_V2,
    value: BigNumber.from(methodParameters.value),
    from: alice.address,
    gasPrice: BigNumber.from(2000000000000),
    type: 1,
  };

  let transactionResponse = await alice.sendTransaction(transaction)
  const receipt = await transactionResponse.wait();
  if (receipt.status != 1) throw 'transaction failed'

  return receipt
};
