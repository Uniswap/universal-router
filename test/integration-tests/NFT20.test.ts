import { CommandType, RoutePlanner } from './shared/planner'
import NFT20_ABI from './shared/abis/NFT20.json'
import { ERC721, Router } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_FACTORY_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  ALPHABETTIES_ADDRESS,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { expect } from 'chai'

const { ethers } = hre

const NFT20_INTERFACE = new ethers.utils.Interface(NFT20_ABI)

describe.only('NFT20', () => {
  let alice: SignerWithAddress
  let router: Router
  let planner: RoutePlanner
  let alphabetties: ERC721

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    await resetFork(15770228)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
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

    alphabetties = new ethers.Contract(ALPHABETTIES_ADDRESS, ERC721_ABI) as ERC721
    alphabetties = alphabetties.connect(alice)
  })

  // In this test we will buy token ids 129, 193, 278 of Alphabetties (0x6d05064fe99e40f1c3464e7310a23ffaded56e20).
  // We will send 0.021~ ETH (20583701229648230 wei), and we will get refunded 1086067487962785 wei
  describe('Buy 3 alphabetties from NFT20', () => {

    it('purchases token ids 129, 193, 278 of Alphabetties', async () => {
      const value = BigNumber.from('20583701229648230')
      const calldata = NFT20_INTERFACE.encodeFunctionData('ethForNft', [
        '0x6d05064fe99e40f1c3464e7310a23ffaded56e20',
        ['129', '193', '278'],
        ['1', '1', '1'],
        ALICE_ADDRESS,
        0,
        false,
      ])
      planner.addCommand(CommandType.NFT20, [value, calldata])
      const commands = planner.commands
      const inputs = planner.inputs

      const aliceBalance = await ethers.provider.getBalance(alice.address)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })
      ).wait()

      // Expect that alice has the NFTs
      await expect((await alphabetties.ownerOf(129)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await alphabetties.ownerOf(193)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await alphabetties.ownerOf(278)).toLowerCase()).to.eq(ALICE_ADDRESS)
      // Expect that alice's account has 0.021 (plus gas, minus refund) less ETH in it
      await expect(aliceBalance.sub(await ethers.provider.getBalance(alice.address))).to.eq(
        value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).sub(BigNumber.from('1086067487962785'))
      )
    })

    it('gas: purchases token ids 129, 193, 278 of Alphabetties', async () => {
      const value = BigNumber.from('20583701229648230')
      const calldata = NFT20_INTERFACE.encodeFunctionData('ethForNft', [
        '0x6d05064fe99e40f1c3464e7310a23ffaded56e20',
        ['129', '193', '278'],
        ['1', '1', '1'],
        ALICE_ADDRESS,
        0,
        false,
      ])
      planner.addCommand(CommandType.NFT20, [value, calldata])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
    })
  })
})
