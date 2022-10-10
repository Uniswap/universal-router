import { RouterPlanner, PermitCommand, V2ExactInputCommand } from '@uniswap/narwhal-sdk'
import type { Contract, ContractFactory } from '@ethersproject/contracts'
import { Router } from '../../typechain'
import { DAI, resetFork, WETH } from './shared/mainnetForkHelpers'
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

describe('PermitPost Integrations', () => {
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

  const permitPostBytecode = PERMIT_POST_COMPILE.bytecode

  const chainId: number = hre.network.config.chainId ? hre.network.config.chainId : 1

  before(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    permitPostFactory = new ethers.ContractFactory(PERMIT_POST_INTERFACE, permitPostBytecode, alice)
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

    // Given we must use Bob to test this contract, Alice gives Bob 1 WETH
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
})
