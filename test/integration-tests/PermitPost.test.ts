import { RouterPlanner, PermitCommand, V2ExactInputCommand } from '@uniswap/narwhal-sdk'
import type { Contract, ContractFactory } from '@ethersproject/contracts'
import { Router } from '../../typechain'
import PERMIT_POST_COMPILE from '../../lib/permitpost/out/PermitPost.sol/PermitPost.json'
import { DAI, resetFork, USDC, WETH } from './shared/mainnetForkHelpers'
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
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
import { expandTo18DecimalsBN } from './shared/helpers'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
const { ethers } = hre
import { BigNumber } from 'ethers'
import { pool_DAI_WETH } from './shared/swapRouter02Helpers'
import { Pair } from '@uniswap/v2-sdk'

describe('PermitPost', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permitPost: Contract
  let planner: RouterPlanner
  let wethContract: Contract
  let routerFactory: ContractFactory
  let permitPostFactory: ContractFactory

  const TOKEN_TYPE_ERC20 = 0
  const TOKEN_TYPE_ERC721 = 1

  const permitPostInterface = new ethers.utils.Interface(PERMIT_POST_COMPILE.abi)
  const permitPostBytecode = PERMIT_POST_COMPILE.bytecode

  type TokenDetails = {
    tokenType: number
    token: string
    maxAmount: BigNumber
    id: BigNumber
  }

  type Permit = {
    tokens: TokenDetails[]
    spender: string
    deadline: BigNumber
    witness: string
  }

  type Signature = {
    v: number
    r: string
    s: string
  }

  const eip712Domain = {
    name: 'PermitPost',
    version: '1',
    chainId: hre.network.config.chainId,
    verifyingContract: ethers.constants.AddressZero,
  }

  const eip712Types = {
    TokenDetails: [
      { name: 'tokenType', type: 'uint8' },
      { name: 'token', type: 'address' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'id', type: 'uint256' },
    ],
    Permit: [
      { name: 'sigType', type: 'uint8' },
      { name: 'tokens', type: 'TokenDetails[]' },
      { name: 'spender', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
    ],
  }

  function constructData(permit: Permit, to: string[], amounts: BigNumber[], signature: Signature): string {
    const calldata = permitPostInterface.encodeFunctionData('transferFrom', [
      ethers.constants.AddressZero,
      permit,
      to,
      amounts,
      signature,
    ])

    return '0x' + calldata.slice(74)
  }

  async function signPermit(
    permit: Permit,
    signatureType: number,
    nonce: number,
    signer: SignerWithAddress
  ): Promise<Signature> {
    const eip712Values = {
      sigType: signatureType,
      tokens: permit.tokens,
      spender: permit.spender,
      deadline: permit.deadline,
      witness: permit.witness,
      nonce: nonce,
    }

    const signature = await signer._signTypedData(eip712Domain, eip712Types, eip712Values)

    return {
      r: '0x' + signature.slice(2, 66),
      s: '0x' + signature.slice(66, 130),
      v: Number('0x' + signature.slice(130)),
    }
  }

  before(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    permitPostFactory = new ethers.ContractFactory(permitPostInterface, permitPostBytecode, alice)
    routerFactory = await ethers.getContractFactory('Router')

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

    eip712Domain.verifyingContract = permitPost.address

    // Given we must use Bob to test this contract, Alice gives Bob 1 WETH
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(10))
    // Bob approves the permit post contract to transfer funds
    await wethContract.connect(bob).approve(permitPost.address, MAX_UINT)
  })

  it('Fetch ERC20 via permit post', async () => {
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
    const nonce: number = 0 // currently no nonces have been used

    // Now Bob signs this payload
    const signature = await signPermit(permit, signatureType, nonce, bob)

    // Construct the permit post transferFrom calldata, without the function selector first parameter
    // The resulting calldata is what we pass into permit post
    const amountToTransfer = expandTo18DecimalsBN(1)
    const calldata = constructData(permit, [router.address], [amountToTransfer], signature)

    const bobBalanceBefore = await wethContract.balanceOf(bob.address)
    const routerBalanceBefore = await wethContract.balanceOf(router.address)

    planner.add(PermitCommand(calldata))
    const { commands, state } = planner.plan()
    await router.execute(DEADLINE, commands, state)

    const bobBalanceAfter = await wethContract.balanceOf(bob.address)
    const routerBalanceAfter = await wethContract.balanceOf(router.address)

    expect(bobBalanceBefore).to.be.eq(bobBalanceAfter.add(amountToTransfer))
    expect(routerBalanceBefore).to.be.eq(routerBalanceAfter.sub(amountToTransfer))
  })

  it('gas: transfer ERC20 into router nonce 0', async () => {
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
    const nonce: number = 0 // currently no nonces have been used

    // Now Bob signs this payload
    const signature = await signPermit(permit, signatureType, nonce, bob)

    // Construct the permit post transferFrom calldata, without the function selector first parameter
    // The resulting calldata is what we pass into permit post
    const amountToTransfer = expandTo18DecimalsBN(1)
    const calldata = constructData(permit, [router.address], [amountToTransfer], signature)

    planner.add(PermitCommand(calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state))
  })

  it('gas: transfer ERC20 into Uniswap Pair nonce 1', async () => {
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
    const signature = await signPermit(permit, signatureType, nonce, bob)

    // Construct the permit post transferFrom calldata, without the function selector first parameter
    // The resulting calldata is what we pass into permit post
    const amountToTransfer = expandTo18DecimalsBN(1)
    const calldata = constructData(permit, [Pair.getAddress(DAI, WETH)], [amountToTransfer], signature)

    planner.add(PermitCommand(calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state))
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
    const signature = await signPermit(permit, signatureType, nonce, bob)

    // Construct the permit post transferFrom calldata, without the function selector first parameter
    // The resulting calldata is what we pass into permit post
    const inputAmount = expandTo18DecimalsBN(1)
    const calldata = constructData(permit, [Pair.getAddress(DAI, WETH)], [inputAmount], signature)

    // Transfers 1 WETH into Uniswap pool
    planner.add(PermitCommand(calldata))
    // Min amount out of 1000 DAI, WETH for DAI, transfer to Alice
    planner.add(V2ExactInputCommand(expandTo18DecimalsBN(1000), [WETH.address, DAI.address], alice.address))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state))
  })
})
