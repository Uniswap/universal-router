import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { UniversalRouter, Permit2, ERC721, ERC1155 } from '../../typechain'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { parseEvents } from './shared/parseEvents'
import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import { TWERKY_1155, resetFork, MILADY_721 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, NFTX_MILADY_VAULT_ID, NFTX_ERC_1155_VAULT_ID, ETH_ADDRESS } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
const { ethers } = hre

const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

describe('NFTX', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let miladyContract: ERC721
  let twerkyContract: ERC1155
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork(17029001) // 17029002 - 1
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    miladyContract = MILADY_721.connect(alice)
    twerkyContract = TWERKY_1155.connect(alice)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  it('completes an ERC-721 buyAndRedeem order with random selection', async () => {
    const value = expandTo18DecimalsBN(2.036523961400441269)
    const numMiladys = 1
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_MILADY_VAULT_ID,
      numMiladys,
      [],
      '0xd9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000001bfb8d0ff32c43470000000000000000000000000000000000000000000000000e27c49886e6000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000227c7df69d3ed1ae7574a1a7685fded90292eb48869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000465b3a7f1b643618cb',
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const { commands, inputs } = planner

    const miladyBalanceBefore = await miladyContract.balanceOf(alice.address)
    await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
    const miladyBalanceAfter = await miladyContract.balanceOf(alice.address)

    expect(miladyBalanceAfter.sub(miladyBalanceBefore)).to.eq(numMiladys)
  })

  it('completes an ERC-721 buyAndRedeem order with specific selection', async () => {
    const value = expandTo18DecimalsBN(2.036523961400441269)
    const numMiladys = 1
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_MILADY_VAULT_ID,
      numMiladys,
      [7132],
      '0xd9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000001bfb8d0ff32c43470000000000000000000000000000000000000000000000000e27c49886e6000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000227c7df69d3ed1ae7574a1a7685fded90292eb48869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000465b3a7f1b643618cb',
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const { commands, inputs } = planner

    const miladyBalanceBefore = await miladyContract.balanceOf(alice.address)
    const miladyOwnerBefore = await miladyContract.ownerOf(7132)
    await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const miladyBalanceAfter = await miladyContract.balanceOf(alice.address)
    const miladyOwnerAfter = await miladyContract.ownerOf(7132)

    expect(miladyBalanceAfter.sub(miladyBalanceBefore)).to.eq(numMiladys)
    expect(miladyOwnerBefore).to.not.eq(alice.address)
    expect(miladyOwnerAfter).to.eq(alice.address)
  })

  it('completes an ERC-1155 buyAndRedeem order with random selection', async () => {
    const value = expandTo18DecimalsBN(0.09115921)
    const numTwerkys = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_ERC_1155_VAULT_ID,
      numTwerkys,
      [13, 16],
      '0xd9627aa40000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000014240569380d14a0000000000000000000000000000000000000000000000001d6bc0c48bd4000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000078e09c5ec42d505742a52fd10078a57ea186002a869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000f24dfbbcf664372d25',
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const { commands, inputs } = planner

    const tx = await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
    const receipt = await tx.wait()
    const tokenIds = parseEvents(twerkyContract.interface, receipt).map((event) => event!.args.id)
    expect(await twerkyContract.balanceOf(alice.address, tokenIds[0])).to.eq(1)
    expect(await twerkyContract.balanceOf(alice.address, tokenIds[1])).to.eq(1)
  })

  it('completes an ERC-1155 buyAndRedeem order with specific selection', async () => {
    const value = expandTo18DecimalsBN(0.02561498)
    const numTwerkys = 1
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_ERC_1155_VAULT_ID,
      numTwerkys,
      [13],
      '0xd9627aa40000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000005a8cca0bd3ccc90000000000000000000000000000000000000000000000000eb5e06245ea000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000078e09c5ec42d505742a52fd10078a57ea186002a869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000c6fd773d7864372d7e',
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const { commands, inputs } = planner

    const twerkyBalanceBefore = await twerkyContract.balanceOf(alice.address, 13)
    await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const twerkyBalanceAfter = await twerkyContract.balanceOf(alice.address, 13)

    expect(twerkyBalanceAfter.sub(twerkyBalanceBefore)).to.eq(numTwerkys)
  })

  it('returns all extra ETH when sending too much', async () => {
    const value = expandTo18DecimalsBN(10)
    const numMiladys = 1
    const saleCost = BigNumber.from('2016360357822219079')
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_MILADY_VAULT_ID,
      numMiladys,
      [7132],
      '0xd9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000001bfb8d0ff32c43470000000000000000000000000000000000000000000000000e27c49886e6000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000227c7df69d3ed1ae7574a1a7685fded90292eb48869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000465b3a7f1b643618cb',
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])
    const { commands, inputs } = planner

    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.changeEtherBalance(
      alice,
      saleCost.mul(-1)
    )
  })
})
