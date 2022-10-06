import { RouterPlanner, PermitCommand } from '@uniswap/narwhal-sdk'
import type { Contract, ContractFactory } from '@ethersproject/contracts'
import { Router } from '../../typechain'
import PERMIT_POST_COMPILE from '../../lib/permitpost/out/PermitPost.sol/PermitPost.json'
import { resetFork, WETH } from './shared/mainnetForkHelpers'
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
const { ethers } = hre
import { BigNumber } from 'ethers'
import fs from 'fs'
import { defaultAbiCoder as abiCoder, keccak256 } from 'ethers/lib/utils'

describe.only('PermitPost', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let permitPost: Contract
  let value: BigNumber
  let planner: RouterPlanner
  let wethContract: Contract
  let routerFactory: ContractFactory
  let permitPostFactory: ContractFactory

  const permitPostInterface = new ethers.utils.Interface(PERMIT_POST_COMPILE.abi)
  const permitPostBytecode = PERMIT_POST_COMPILE.bytecode

  // constants used for signatures in permit post
  let TOKEN_DETAILS_TYPEHASH: string
  let PERMIT_TYPEHASH: string
  const VERSION_HASH = keccak256(ethers.utils.toUtf8Bytes("1"))
  const NAME_HASH = keccak256(ethers.utils.toUtf8Bytes("PermitPost"))
  const TYPE_HASH = keccak256(ethers.utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"))

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

  function constructData(
    permit: Permit,
    to: string[],
    amounts: BigNumber[],
    signature: Signature
  ): string {
    const calldata = permitPostInterface.encodeFunctionData('transferFrom', [
      ethers.constants.AddressZero,
      permit,
      to,
      amounts,
      signature,
    ])

    return '0x' + calldata.slice(74)
  }

  async function signPermit(permit: Permit, signatureType: number, nonce: number, signer: SignerWithAddress): Promise<Signature> {
    // first hash each token details
    const hashedTokenDetails = permit.tokens.map((details) => {
      const encodedTokenDetails = abiCoder.encode(
        ['bytes32', 'uint8', 'address', 'uint256', 'uint256'],
        [TOKEN_DETAILS_TYPEHASH, details.tokenType, details.token, details.maxAmount, details.id]
      )
      return keccak256(encodedTokenDetails)
    })

    // encodePacked and hash the token hashes
    const tokensHash = keccak256(abiCoder.encode(Array(hashedTokenDetails.length).fill('bytes32'), hashedTokenDetails))

    // then encode and hash the permit details
    const encodedPermit = abiCoder.encode(
      ['bytes32', 'uint8', 'bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
      [PERMIT_TYPEHASH, signatureType, tokensHash, permit.spender, permit.deadline, permit.witness, nonce]
    )
    const hashedPermit = keccak256(encodedPermit)

    // add domain separator and perform a typed data hash (using EIP191 signed message)
    const DOMAIN_SEPARATOR = keccak256(abiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [TYPE_HASH, NAME_HASH, VERSION_HASH, hre.network.config.chainId, permitPost.address]
    ))
    const msgHash = ethers.utils.hashMessage(abiCoder.encode(['bytes32', 'bytes32'], [DOMAIN_SEPARATOR, hashedPermit]))

    // then sign the permit
    const signature = await signer.signMessage(ethers.utils.arrayify(msgHash))

    return {
      r: '0x' + signature.slice(2, 66),
      s: '0x' + signature.slice(66, 130),
      v: Number('0x' + signature.slice(130)),
    }
  }

  async function fetchEIP712Constants() {
    permitPost = await permitPostFactory.deploy()
    PERMIT_TYPEHASH = await permitPost._PERMIT_TYPEHASH()
    TOKEN_DETAILS_TYPEHASH = await permitPost._TOKEN_DETAILS_TYPEHASH()
  }

  before(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    permitPostFactory = new ethers.ContractFactory(permitPostInterface, permitPostBytecode, alice)
    routerFactory = await ethers.getContractFactory('Router')

    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)

    // gather the constants used in signature production
    await fetchEIP712Constants()
  })

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    permitPost = await permitPostFactory.deploy()

    router = (
      await routerFactory.deploy(
        permitPost.address,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
    planner = new RouterPlanner()

    // Given we must use Bob to test this contract, Alice gives Bob 1 WETH
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(10))
    // Bob approves the permit post contract to transfer funds
    await wethContract.connect(bob).approve(permitPost.address, MAX_UINT)
  })

  it('Fetch ERC20 via permit post ', async () => {
    // We construct Bob's permit
    const id = BigNumber.from(0)
    const tokenDetails: TokenDetails = {
      tokenType: 0, // ERC20
      token: WETH.address,
      maxAmount: expandTo18DecimalsBN(2),
      id,
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
    await router.execute(DEADLINE, commands, state, { value: value })

    const bobBalanceAfter = await wethContract.balanceOf(bob.address)
    const routerBalanceAfter = await wethContract.balanceOf(router.address)

    expect(bobBalanceBefore).to.be.eq(bobBalanceAfter.add(amountToTransfer))
    expect(routerBalanceBefore).to.be.eq(routerBalanceAfter.sub(amountToTransfer))
  })
})
