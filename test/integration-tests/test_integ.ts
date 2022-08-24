import { defaultAbiCoder, Interface, LogDescription } from '@ethersproject/abi';
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import type { Contract } from '@ethersproject/contracts';
import { CommandFlags, RouterCall, RouterCommand, RouterPlanner, TransferCommand, V2SwapCommand, CheckAmountGTECommand } from '@uniswap/narwhal-sdk';
import { BigintIsh, Currency, CurrencyAmount, Ether, Percent, Token, TradeType, WETH9 } from '@uniswap/sdk-core'
import { Pair, Route as V2Route, Trade as V2Trade } from '@uniswap/v2-sdk'
import hardhat from 'hardhat'
import {
  encodeSqrtRatioX96,
  FeeAmount,
  MethodParameters,
  nearestUsableTick,
  Pool,
  Route as V3Route,
  TickMath,
  TICK_SPACINGS,
  Trade as V3Trade,
} from '@uniswap/v3-sdk'
import JSBI from 'jsbi'
import { SwapRouter, Trade } from '@uniswap/router-sdk'
import { expect } from '../shared/expect'
import { BigNumber, constants, Contract as EthersContract, providers } from 'ethers'
import { RouterWeirollVM, IERC20 } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'

// import { abi as ROUTER_ABI } from '../abis/SwapRouter02.json'
// import { abi as IERC20 } from '../abis/IERC20.json'


import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

function expandTo18Decimals(n: number): BigintIsh {
  return JSBI.BigInt(BigNumber.from(n).mul(BigNumber.from(10).pow(18)).toString())
}

function expandTo18DecimalsBN(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

function parseEvents(iface: Interface, receipt: TransactionReceipt): (LogDescription | undefined)[] {
  return receipt.logs.map((log: { topics: Array<string>, data: string }) => {
    try { return iface.parseLog(log) }
    catch(e) { return undefined}
  }).filter((n: LogDescription | undefined) => n)
}

const V2_EVENTS = new Interface([
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
])


describe('SwapRouter', () => {
  const WETH = WETH9[1]
  const DAI = new Token(1,'0x6B175474E89094C44Da98b954EedeAC495271d0F',18,'DAI','Dai Stablecoin');
  const USDC = new Token(1,'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD//C');

  const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'

  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')

  const feeAmount = FeeAmount.MEDIUM
  const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
  const liquidity = 1_000_000

  // v3
  const makePool = (token0: Token, token1: Token, liquidity: number) => {
    return new Pool(token0, token1, feeAmount, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: -liquidity,
        liquidityGross: liquidity,
      },
    ])
  }

  // v2
  const makePair = (token0: Token, token1: Token, liquidity: BigintIsh) => {
    const amount0 = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(liquidity))
    const amount1 = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(liquidity))

    return new Pair(amount0, amount1)
  }

  const pool_0_1 = makePool(token0, token1, liquidity)
  const pair_0_1 = makePair(token0, token1, liquidity)

  const pool_1_WETH = makePool(token1, WETH, liquidity)
  const pair_1_WETH = makePair(token1, WETH, liquidity)

  const pool_DAI_WETH = makePool(DAI, WETH, liquidity)
  const pair_USDC_WETH = makePair(USDC, WETH, liquidity)
  const pair_DAI_WETH = makePair(DAI, WETH, liquidity)

  const slippageTolerance = new Percent(50, 100)
  const recipient = '0x0000000000000000000000000000000000000003'
  const deadline = 2000000000

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

    // const aliceTokenIn = await ethers.getContractAt(currency.address, TOKEN_ABI , alice) as EthersContract;
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

  const executeSwap = async (
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency,
    gasLimit?: BigNumber,
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    expect(tokenIn.symbol).not.to.equal(tokenOut.symbol);
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
    const aliceTokenIn = new ethers.Contract(tokenIn.wrapped.address, TOKEN_ABI, alice) as EthersContract;

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
    expect(receipt.status == 1).to.equal(true); // Check for txn success

    const transaction2 = {
      data:'0xd9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000004563918244f4000000000000000000000000000000000000000000000000000000056819caa164a6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee869584cd000000000000000000000000100000000000000000000000000000000000001100000000000000000000000000000000000000000000006a24319cd7630519cd',
      to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      value: 0,
      from: alice.address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    };

    let transactionResponse2 = await alice.sendTransaction(transaction2)
    const receipt2 = await transactionResponse2.wait();
    expect(receipt2.status == 1).to.equal(true); // Check for txn success

    const tokenInAfter = await getBalance(alice, tokenIn);
    const tokenOutAfter = await getBalance(alice, tokenOut);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    };
  };

  let alice: SignerWithAddress
  let daiContract: Contract
  let wethContract: Contract

  beforeEach(async () => {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xf977814e90da44bfa03b6295a0616a897441acec"],
    });
    alice = await ethers.getSigner('0xf977814e90da44bfa03b6295a0616a897441acec')
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
  })

  describe('#single-hop exact input (v2 + v3)', () => {
    describe('with Router02', () => {
      const amountIn = CurrencyAmount.fromRawAmount(DAI, expandTo18Decimals(5))
      const v2Trade = V2Trade.exactIn(new V2Route([pair_DAI_WETH], DAI, WETH), amountIn)
      const v3Trade = V3Trade.fromRoute(new V3Route([pool_DAI_WETH], DAI, WETH), amountIn, TradeType.EXACT_INPUT)

      it('router-sdk', async () => {
        const trades = [v2Trade]//, v2Trade, v2Trade, v2Trade, v2Trade, v2Trade]
        const { calldata, value } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })

        await executeSwap({ value: '0', calldata }, DAI, WETH)
      })

      describe('with Weiroll', () => {
        let weirollRouter: RouterWeirollVM

        beforeEach(async () => {
          const weirollRouterFactory = await ethers.getContractFactory("RouterWeirollVM");
          weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)) as RouterWeirollVM
        })

        it('adds function calls to a list of commands', async () => {
          const amountIn = expandTo18DecimalsBN(5)
          const planner = new RouterPlanner();
          for (let i = 0; i < 1; i++) {
            planner.add(new TransferCommand(DAI.address, weirollRouter.address, '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11', amountIn));
            const amountOut = planner.add(new V2SwapCommand(amountIn, 1, [DAI.address, WETH.address], alice.address))
          }

          const { commands, state } = planner.plan();

          const balanceBefore = await wethContract.balanceOf(alice.address)
          await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(55))
          const tx = await weirollRouter.execute(commands, state)
          const receipt = await tx.wait()
          const balanceAfter = await wethContract.balanceOf(alice.address)
          const amountOut = parseEvents(V2_EVENTS, receipt)[0]!.args.amount1Out
          expect(balanceAfter.sub(balanceBefore)).to.equal(amountOut)
        })
      })
    })
  })
})
