import { abi as TOKEN_ABI } from '../../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { Currency, CurrencyAmount, Token, WETH9 } from '@uniswap/sdk-core'
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

const getBalance = async (
  alice: SignerWithAddress,
  currency: Currency
): Promise<CurrencyAmount<Currency>> => {
  if (!currency.isToken) {
    return CurrencyAmount.fromRawAmount(
      currency,
      (await alice.getBalance()).toString()
    );
  }
  const aliceTokenIn = new ethers.Contract(currency.address, TOKEN_ABI, alice) as EthersContract;

  return CurrencyAmount.fromRawAmount(
    currency,
    (await aliceTokenIn.balanceOf(alice.address)).toString()
  );
};

const getBalanceAndApprove = async (
  alice: SignerWithAddress,
  approveTarget: string,
  currency: Currency
): Promise<CurrencyAmount<Currency>> => {
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
  return getBalance(alice, currency);
};

export const executeSwap = async (
  methodParameters: MethodParameters,
  tokenIn: Currency,
  tokenOut: Currency,
  alice: SignerWithAddress,
): Promise<{
  tokenInAfter: CurrencyAmount<Currency>;
  tokenInBefore: CurrencyAmount<Currency>;
  tokenOutAfter: CurrencyAmount<Currency>;
  tokenOutBefore: CurrencyAmount<Currency>;
}> => {
  if (tokenIn.symbol == tokenOut.symbol) throw 'Cannot trade token for itself';
  // We use this helper function for approving rather than ethers.provider.provider.approve
  // because there is custom logic built in for handling USDT and other checks
  const tokenInBefore = await getBalanceAndApprove(
    alice,
    SWAP_ROUTER_V2,
    tokenIn
  );
  await getBalanceAndApprove(
    alice,
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    tokenIn
  );
  const tokenOutBefore = await getBalance(alice, tokenOut);

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

  const tokenInAfter = await getBalance(alice, tokenIn);
  const tokenOutAfter = await getBalance(alice, tokenOut);

  return {
    tokenInAfter,
    tokenInBefore,
    tokenOutAfter,
    tokenOutBefore,
  };
};
