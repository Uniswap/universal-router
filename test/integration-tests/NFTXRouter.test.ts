import type { Contract } from '@ethersproject/contracts'
import { RouterPlanner, NFTXCommand } from '@uniswap/narwhal-sdk'
import { expect } from './shared/expect'
import { Router } from '../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import parseEvents from './shared/parseEvents'
import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC1155_ABI } from '../../artifacts/solmate/src/tokens/ERC1155.sol/ERC1155.json'
import { resetFork, WETH } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  NFTX_COVEN_VAULT,
  NFTX_COVEN_VAULT_ID,
  NFTX_ERC_1155_VAULT,
  NFTX_ERC_1155_VAULT_ID,
} from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
const { ethers } = hre

const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

describe('NFTX', () => {
  let alice: SignerWithAddress
  let router: Router
  let covenContract: Contract
  let twerkyContract: Contract
  let planner: RouterPlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
    twerkyContract = new ethers.Contract('0xf4680c917a873e2dd6ead72f9f433e74eb9c623c', ERC1155_ABI, alice)
    const routerFactory = await ethers.getContractFactory('Router')
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

  it('completes an ERC-721 buyAndRedeem order with random selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [],
      [WETH.address, NFTX_COVEN_VAULT],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const covenBalanceBefore = await covenContract.balanceOf(alice.address)
    await router.execute(DEADLINE, commands, state, { value })
    const covenBalanceAfter = await covenContract.balanceOf(alice.address)

    expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(numCovens)
  })

  it('completes an ERC-721 buyAndRedeem order with specific selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [584, 3033],
      [WETH.address, NFTX_COVEN_VAULT],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const covenBalanceBefore = await covenContract.balanceOf(alice.address)
    const covenOwner584Before = await covenContract.ownerOf(584)
    const covenOwner3033Before = await covenContract.ownerOf(3033)
    await (await router.execute(DEADLINE, commands, state, { value })).wait()
    const covenBalanceAfter = await covenContract.balanceOf(alice.address)
    const covenOwner584After = await covenContract.ownerOf(584)
    const covenOwner3033After = await covenContract.ownerOf(3033)

    expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(numCovens)
    expect(covenOwner584Before).to.not.eq(alice.address)
    expect(covenOwner3033Before).to.not.eq(alice.address)
    expect(covenOwner584After).to.eq(alice.address)
    expect(covenOwner3033After).to.eq(alice.address)
  })

  it('completes an ERC-1155 buyAndRedeem order with random selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numTwerkys = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_ERC_1155_VAULT_ID,
      numTwerkys,
      [],
      [WETH.address, NFTX_ERC_1155_VAULT],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const tx = await router.execute(DEADLINE, commands, state, { value })
    const receipt = await tx.wait()
    const tokenIds = parseEvents(twerkyContract.interface, receipt).map((event) => event!.args.id)
    expect(await twerkyContract.balanceOf(alice.address, tokenIds[0])).to.eq(1)
    expect(await twerkyContract.balanceOf(alice.address, tokenIds[1])).to.eq(1)
  })

  it('completes an ERC-1155 buyAndRedeem order with specific selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numTwerkys = 1
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_ERC_1155_VAULT_ID,
      numTwerkys,
      [44],
      [WETH.address, NFTX_ERC_1155_VAULT],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const twerkyBalanceBefore = await twerkyContract.balanceOf(alice.address, 44)
    await (await router.execute(DEADLINE, commands, state, { value })).wait()
    const twerkyBalanceAfter = await twerkyContract.balanceOf(alice.address, 44)

    expect(twerkyBalanceAfter.sub(twerkyBalanceBefore)).to.eq(numTwerkys)
  })

  it('returns all extra ETH when sending too much', async () => {
    const value = expandTo18DecimalsBN(10)
    const numCovens = 2
    const saleCost = '476686977628668346'
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [584, 3033],
      [WETH.address, '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()

    const ethBalanceBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router.execute(DEADLINE, commands, state, { value })).wait()
    const ethDelta = ethBalanceBefore.sub(await ethers.provider.getBalance(alice.address))
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(ethDelta.sub(gasSpent)).to.eq(saleCost)
  })

  it('gas: buyAndRedeem w/ random selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [],
      [WETH.address, '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })

  it('gas: buyAndRedeem w/ specific selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [584, 3033],
      [WETH.address, '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'],
      alice.address,
    ])

    planner.add(NFTXCommand(value.toString(), calldata))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })
})
