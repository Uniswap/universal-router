import type { Contract } from '@ethersproject/contracts'
import { RouterPlanner, SeaportCommand } from '@uniswap/narwhal-sdk'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'

import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
const { ethers } = hre
import fs from 'fs'

const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)
const COVEN_VAULT = '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'
const COVEN_VAULT_ID = '333'


describe('NFTX', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let covenContract: Contract
  let planner: RouterPlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
    planner = new RouterPlanner()
  })

  afterEach(async () => {
    await resetFork()
  })

  it('completes a buyAndRedeem order', async () => {
    const { order, value } = getOrderParams(seaportOrders[0])
    const params = order.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillOrder', [order, OPENSEA_CONDUIT_KEY])

    planner.add(SeaportCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await weirollRouter.execute(DEADLINE, commands, state, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(weirollRouter.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })
})
