import { RouterPlanner, LooksRareCommand } from '@uniswap/narwhal-sdk'
import type { Contract, ContractFactory } from '@ethersproject/contracts'
import { Router, ERC721, IPermitPost } from '../../typechain'
import PERMIT_POST_COMPILE from '../../lib/permitpost/out/PermitPost.sol/PermitPost.json'
import { resetFork, WETH, DYSTOMICE_NFT } from './shared/mainnetForkHelpers'
import {
  BYTES_32_1S,
  BYTES_32_2S,
  MAX_UINT,
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
import { expandTo18DecimalsBN } from './shared/helpers'
const { ethers } = hre
import { BigNumber } from 'ethers'
import fs from 'fs'
import { id } from 'ethers/lib/utils'

describe.only('PermitPost', () => {
  let alice: SignerWithAddress
  let router: Router
  let permitPost: Contract
  let value: BigNumber
  let planner: RouterPlanner
  let wethContract: Contract
  let routerFactory: ContractFactory
  let permitPostFactory: ContractFactory

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

  function constructData(
    permit: Permit,
    tokens: string[],
    amounts: number[],
    ids: BigNumber[],
    signature: Signature
  ): string {
    const calldata = permitPostInterface.encodeFunctionData('transferFrom', [
      ethers.constants.AddressZero,
      permit,
      tokens,
      ids,
      amounts,
      signature,
    ])

    return calldata.slice(74)
  }

  function signPermit(permit: Permit, signatureType: number, nonce: number): Signature {
    permitPost._PERMIT_TYPEHASH()
    permitPost._TOKEN_DETAILS_TYPEHASH()

    const signature2: Signature = {
      v: 27,
      r: BYTES_32_1S,
      s: BYTES_32_2S,
    }
    return signature2
  }

  before(async () => {
    alice = await ethers.getSigner(ALICE_ADDRESS)

    const [owner] = await ethers.getSigners()
    permitPostFactory = new ethers.ContractFactory(permitPostInterface, permitPostBytecode, owner)
    routerFactory = await ethers.getContractFactory('Router')

    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, owner)
  })

  beforeEach(async () => {
    await resetFork()
    permitPost = await permitPostFactory.deploy()

    router = (
      await routerFactory.deploy(
        ethers.constants.AddressZero,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
    planner = new RouterPlanner()
  })

  it('Fetch ERC20 via permit post ', async () => {
    // first Alice approves permitPost to access her WETH
    await wethContract.approve(permitPost.address, MAX_UINT)

    // We construct Alice's permit
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
      witness: BYTES_32_2S,
    }

    const signatureType: number = 1 // sequential

    const nonce: number = 0 // currently no nonces have been used

    // Now Alice signs this payload
    const signature = signPermit(permit, signatureType, nonce)

    const signature2: Signature = {
      v: 27,
      r: BYTES_32_1S,
      s: BYTES_32_2S,
    }
    const calldata = constructData(permit, [DYSTOMICE_NFT.address], [0], [id], signature2)
  })
})
