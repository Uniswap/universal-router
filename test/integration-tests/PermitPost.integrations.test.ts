import { RouterPlanner, PermitCommand, V2ExactInputCommand } from '@uniswap/narwhal-sdk'
import type { Contract, ContractFactory } from '@ethersproject/contracts'
import { Router } from '../../typechain'
import { DAI, executeSwap, resetFork, SWAP_ROUTER_V2, USDC, WETH } from './shared/mainnetForkHelpers'
import PERMIT_POST_COMPILE from '../../lib/permitpost/out/PermitPost.sol/PermitPost.json'
import {
  EMPTY_BYTES_32,
  MAX_UINT,
  ALICE_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { Route as V3RouteSDK, FeeAmount } from '@uniswap/v3-sdk'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expandTo18DecimalsBN } from './shared/helpers'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
const { ethers } = hre
import { BigNumber } from 'ethers'
import { Pair } from '@uniswap/v2-sdk'
import {
  constructPermitCalldata,
  Permit,
  PERMIT_POST_INTERFACE,
  signPermit,
  TokenDetails,
} from './shared/protocolHelpers/permitPost'
import { SwapRouter, MixedRouteSDK, Trade } from '@uniswap/router-sdk'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { pool_DAI_USDC, pool_DAI_WETH, pool_USDC_WETH } from './shared/swapRouter02Helpers'

describe.only('PermitPost Integrations', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permitPost: Contract
  let planner: RouterPlanner
  let usdcContract: Contract
  let wethContract: Contract
  let routerFactory: ContractFactory
  let permitPostFactory: ContractFactory

  const TOKEN_TYPE_ERC20 = 0
  const TOKEN_TYPE_ERC721 = 1

  const permitPostBytecode = PERMIT_POST_COMPILE.bytecode

  const chainId: number = hre.network.config.chainId ? hre.network.config.chainId : 1

  function getUSDCAmountIn(amount: number) : number {
    return amount * (10 ** 6)
  }

  before(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    permitPostFactory = new ethers.ContractFactory(PERMIT_POST_INTERFACE, permitPostBytecode, alice)
    routerFactory = await ethers.getContractFactory('Router')

    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
  })

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    permitPost = await (await permitPostFactory.deploy()).connect(bob)

    router = (
      await routerFactory.deploy(
        permitPost.address,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(bob) as Router
    planner = new RouterPlanner()

    // Given we must use Bob to test this contract, Alice gives Bob 100,000 USDC and 10 WETH
    await usdcContract.connect(alice).transfer(bob.address, getUSDCAmountIn(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(10))
    // Bob approves the permit post contract to transfer funds
    await wethContract.connect(bob).approve(permitPost.address, MAX_UINT)
  })

  it('gas: permit post, uniswap v2 single hop', async () => {
    // bob increments his nonce past 0
    await permitPost.invalidateNonces(1)

    // We construct Bob's permit
    const tokenDetails: TokenDetails = {
      tokenType: TOKEN_TYPE_ERC20, // ERC20
      token: WETH.address,
      maxAmount: expandTo18DecimalsBN(2),
      id: BigNumber.from(0),
    }

    const permit: Permit = {
      tokens: [tokenDetails],
      spender: router.address, // the router is the one who will claim the WETH
      deadline: BigNumber.from(MAX_UINT),
      witness: EMPTY_BYTES_32,
    }

    const signatureType: number = 1 // sequential
    const nonce: number = 1 // currently no nonces have been used

    // Now Bob signs this payload
    const signature = await signPermit(permit, signatureType, nonce, bob, chainId, permitPost.address)

    // Construct the permit post transferFrom calldata, without the function selector first parameter
    // The resulting calldata is what we pass into permit post
    const inputAmount = expandTo18DecimalsBN(1)
    const calldata = constructPermitCalldata(permit, [Pair.getAddress(DAI, WETH)], [inputAmount], signature)

    // Transfers 1 WETH into Uniswap pool
    planner.add(PermitCommand(calldata))
    // Min amount out of 1000 DAI, WETH for DAI, transfer to Alice
    planner.add(V2ExactInputCommand(expandTo18DecimalsBN(1000), [WETH.address, DAI.address], alice.address))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state))
  })

  const slippageTolerance = new Percent(10, 100)
  const deadline = 2000000000
  const simpleSwapAmountIn = CurrencyAmount.fromRawAmount(USDC, getUSDCAmountIn(1000))
  let v3ExactInMultihop: Trade<Token, Token, TradeType.EXACT_INPUT>

  describe('First Time User.', () => {
    describe('Simple Swap.', () => {
      describe('SwapRouter02.', () => {
        it('Max Approve SwapRouter02', async () => {
          await snapshotGasCost(usdcContract.approve(SWAP_ROUTER_V2, MAX_UINT))
        })

        it('Swap SwapRouter02', async () => {
          // USDC -> WETH -> DAI
          v3ExactInMultihop = await Trade.fromRoute(
            new V3RouteSDK([pool_USDC_WETH, pool_DAI_WETH], USDC, DAI),
            simpleSwapAmountIn,
            TradeType.EXACT_INPUT
          )
          const { calldata } = SwapRouter.swapCallParameters(v3ExactInMultihop, {
            slippageTolerance,
            recipient: bob.address,
            deadlineOrPreviousBlockhash: 2000000000,
          })
  
          await snapshotGasCost(executeSwap({ value: '0', calldata }, USDC, DAI, bob))
        })
      })

      describe('PP Sign-Per-Swap.', () => {
        it('Max Approve Permit2', async () => {
          await snapshotGasCost(usdcContract.approve(permitPost.address, MAX_UINT))
        })

        it('Swap Narwhal')
      })
    })
  })
})
