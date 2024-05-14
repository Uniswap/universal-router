import type { Contract } from '@ethersproject/contracts'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { ecrecover, ecsign, hexToBytes, toRpcSig } from '@ethereumjs/util'
import { expect } from './shared/expect'
import { BigNumber, BigNumberish, Wallet } from 'ethers'
import { config } from "hardhat";
import { Permit2, UniversalRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI } from './shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  DEADLINE,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
} from './shared/constants'
import { expandTo18DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType, ROUTER_AS_RECIPIENT, SENDER_AS_RECIPIENT } from './shared/planner'
import hre from 'hardhat'
import { SignatureTransfer } from '@uniswap/permit2-sdk'
const { ethers } = hre

describe('Maker order filler tests:', () => {
  let alice: SignerWithAddress
  let taker: SignerWithAddress
  let maker: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let takerTokenContract: Contract
  let makerTokenContract: Contract
  let planner: RoutePlanner

  const makerAmount: BigNumber = expandTo18DecimalsBN(10);
  const takerAmount: BigNumber = expandTo18DecimalsBN(200);
  const nonce: string = '0x0';
  const chainId: number = hre.network.config.chainId ?? 1;
  let signature: string;

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    taker = (await ethers.getSigners())[1]
    maker = (await ethers.getSigners())[2]

    takerTokenContract = new ethers.Contract(DAI.address, TOKEN_ABI, taker)
    makerTokenContract = new ethers.Contract(WETH.address, TOKEN_ABI, taker)
    permit2 = (await deployPermit2()) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(taker) as UniversalRouter
    planner = new RoutePlanner()

    // Alice gives taker and maker some tokens
    await takerTokenContract.connect(alice).transfer(taker.address, expandTo18DecimalsBN(100000))
    await makerTokenContract.connect(alice).transfer(maker.address, expandTo18DecimalsBN(100))

    // Taker max-approves the permit2 contract to access his taker token (DAI)
    await takerTokenContract.connect(taker).approve(permit2.address, MAX_UINT)

    // Maker max-approves the permit2 contract to access his maker token (WETH)
    await makerTokenContract.connect(maker).approve(permit2.address, MAX_UINT)

    // taker gives the router max approval on permit2
    await permit2.connect(taker).approve(takerTokenContract.address, router.address, MAX_UINT160, DEADLINE);

    // maker provided signed maker order
    const makerOrderHash = SignatureTransfer.hash(
      {
        permitted: {
          token: makerTokenContract.address,
          amount: makerAmount,
        },
        spender: router.address,
        nonce,
        deadline: DEADLINE,
      },
      permit2.address,
      chainId,
      {
        witnessTypeName: 'MakerOrderWitness',
        witnessType: {
          MakerOrderWitness: [
            { name: 'takerToken', type: 'address' },
            { name: 'takerAmount', type: 'uint256' },
          ]
        },
        witness: {
          takerToken: takerTokenContract.address,
          takerAmount: takerAmount.toString(),
        },
      }
    );

    const accounts = config.networks.hardhat.accounts;
    const makerWallet = ethers.Wallet.fromMnemonic(accounts.mnemonic, accounts.path + `/${2}`);
    const makerKey = makerWallet.privateKey
    // console.log(`maker privateKey: ${makerKey}`);
    // console.log(`maker address: ${maker.address}`);
    // console.log(`maker wallet address: ${makerWallet.address}`);
    // console.log(`taker address: ${taker.address}`);
    // console.log(`router address: ${router.address}`);
    // console.log(`permit2 address: ${permit2.address}`);
    const ecdaSig = ecsign(hexToBytes(makerOrderHash), hexToBytes(makerKey));
    // console.log(`maker order hash: ${makerOrderHash}`);
    // console.log(`ecdaSig.r: ${ecdaSig.r}`);
    // console.log(`ecdaSig.s: ${ecdaSig.s}`);
    // console.log(`ecdaSig.v: ${ecdaSig.v}`);
    signature = toRpcSig(ecdaSig.v, ecdaSig.r, ecdaSig.s);
    // console.log(`maker order signature: ${signature}`);
    // const recoveredSignerAddress = ecrecover(hexToBytes(makerOrderHash), ecdaSig.v, ecdaSig.r, ecdaSig.s)
    // console.log(`recoveredSignerAddress: ${recoveredSignerAddress}`);
  });

  describe('ERC20 --> ERC20 partial fill', () => {
    let amountIn: BigNumber;
  
    beforeEach(async () => {
      amountIn = expandTo18DecimalsBN(100);
    });

    it('Taker as payer, and taker as recipient', async () => {
      const payerIsUser: boolean = true;
      const recipient: string = taker.address;

      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });

    it('Taker as payer, and MSG_SENDER as recipient', async () => {
      const payerIsUser: boolean = true;
      const recipient: string = MSG_SENDER;

      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });

    it('Taker as payer, and router as recipient', async () => {
      const payerIsUser: boolean = true;
      const recipient: string = ADDRESS_THIS;

      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      planner.addCommand(CommandType.SWEEP, [
          makerTokenContract.address,
          SENDER_AS_RECIPIENT,
          BigNumber.from(0),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });


    it('Router as payer, and taker as recipient', async () => {
      const payerIsUser: boolean = false;
      const recipient: string = taker.address;

      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        takerTokenContract.address,
        ROUTER_AS_RECIPIENT,
        amountIn,
      ]);
      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });

    it('Router as payer, and MSG_SENDER as recipient', async () => {
      const payerIsUser: boolean = false;
      const recipient: string = MSG_SENDER;

      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        takerTokenContract.address,
        ROUTER_AS_RECIPIENT,
        amountIn,
      ]);
      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });

    it('Router as payer, and router as recipient', async () => {
      const payerIsUser: boolean = false;
      const recipient: string = ADDRESS_THIS;

      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        takerTokenContract.address,
        ROUTER_AS_RECIPIENT,
        amountIn,
      ]);
      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      planner.addCommand(CommandType.SWEEP, [
          makerTokenContract.address,
          SENDER_AS_RECIPIENT,
          BigNumber.from(0),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountIn.mul(makerAmount).div(takerAmount));
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountIn);
    });

    // it('Generate deployed universal router code', async () => {
    //   const deployedPermit2 = permit2.attach('0x000000000022D473030F116dDEE9F6B43aC78BA3') as Permit2
    //   const newRouter = (await deployUniversalRouter(deployedPermit2)).connect(taker) as UniversalRouter
    //   const code = await hre.network.provider.send('eth_getCode', [newRouter.address]);
    //   console.log(`code: ${code}`)
    // });
  });
  
  describe('ERC20 --> ERC20 fill all', () => {
    let amountIn: BigNumber;
  
    beforeEach(async () => {
      amountIn = takerAmount;
    });

    it('Taker as payer, and taker as recipient', async () => {
      const payerIsUser: boolean = true;
      const recipient: string = taker.address;

      planner.addCommand(CommandType.MAKER_ORDER, [
        recipient,
        amountIn,
        payerIsUser,
        makerTokenContract.address,
        takerTokenContract.address,
        maker.address,
        makerAmount,
        takerAmount,
        nonce,
        DEADLINE,
        hexToBytes(signature),
      ]);
      const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner);
      expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(makerAmount);
      expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(takerAmount);
    });
  });

  type ExecutionParams = {
    wethBalanceBefore: BigNumber
    wethBalanceAfter: BigNumber
    daiBalanceBefore: BigNumber
    daiBalanceAfter: BigNumber
    ethBalanceBefore: BigNumber
    ethBalanceAfter: BigNumber
    receipt: TransactionReceipt
    gasSpent: BigNumber
  }

  async function executeRouter(planner: RoutePlanner, value?: BigNumberish): Promise<ExecutionParams> {
    const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(taker.address)
    const wethBalanceBefore: BigNumber = await makerTokenContract.balanceOf(taker.address)
    const daiBalanceBefore: BigNumber = await takerTokenContract.balanceOf(taker.address)

    const { commands, inputs } = planner
    // console.log(`before sending tx`)
    // console.log(inputs[0])
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value, gasLimit: "0x1C9C380" })).wait()
    // console.log(`after sending tx`)
    console.log(`Gas used: ${receipt.gasUsed}`)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(taker.address)
    const wethBalanceAfter: BigNumber = await makerTokenContract.balanceOf(taker.address)
    const daiBalanceAfter: BigNumber = await takerTokenContract.balanceOf(taker.address)

    return {
      wethBalanceBefore,
      wethBalanceAfter,
      daiBalanceBefore,
      daiBalanceAfter,
      ethBalanceBefore,
      ethBalanceAfter,
      receipt,
      gasSpent,
    }
  }
});
