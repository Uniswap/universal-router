import FOUNDATION_ABI from './shared/abis/Foundation.json'
import { Router, ERC721 } from '../../typechain'
import deployRouter from './shared/deployRouter'
import { resetFork } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { expect } from 'chai'
import { CommandType, RoutePlanner } from './shared/planner'
const { ethers } = hre

const FOUNDATION_INTERFACE = new ethers.utils.Interface(FOUNDATION_ABI)
const MENTAL_WORLDS_ADDRESS = '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c'
const REFERRER = '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C'

describe('Foundation', () => {
  let alice: SignerWithAddress
  let router: Router
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  // In this test we will buy token id 32 of mental worlds NFT (0xEf96021Af16BD04918b0d87cE045d7984ad6c38c),
  // which costs 0.01 ETH
  describe('Buy a mental worlds NFT from Foundation', () => {
    let mentalWorlds: ERC721

    beforeEach(async () => {
      await resetFork(15725945)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      router = (await deployRouter()).connect(alice) as Router

      mentalWorlds = new ethers.Contract(MENTAL_WORLDS_ADDRESS, ERC721_ABI) as ERC721
    })

    it('purchases token id 32 of mental worlds', async () => {
      const value = BigNumber.from('10000000000000000')
      const calldata = FOUNDATION_INTERFACE.encodeFunctionData('buyV2', [MENTAL_WORLDS_ADDRESS, 32, value, REFERRER])
      planner.addCommand(CommandType.FOUNDATION, [value, calldata, ALICE_ADDRESS, MENTAL_WORLDS_ADDRESS, 32])
      const commands = planner.commands
      const inputs = planner.inputs

      const aliceBalance = await ethers.provider.getBalance(alice.address)
      const referrerBalance = await ethers.provider.getBalance(REFERRER)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })
      ).wait()

      // Expect that alice has the NFT
      await expect((await mentalWorlds.connect(alice).ownerOf(32)).toLowerCase()).to.eq(ALICE_ADDRESS)
      // Expect that alice's account has 0.01 (plus gas) less ETH in it
      await expect(aliceBalance.sub(await ethers.provider.getBalance(alice.address))).to.eq(
        value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      )
      // Expect that referrer's account has 0.0001 more ETH in it (referrers receive 1% of NFT value)
      await expect((await ethers.provider.getBalance(REFERRER)).sub(referrerBalance)).to.eq(value.div(100))
    })

    it('gas token id 32 of mental worlds', async () => {
      const value = BigNumber.from('10000000000000000')
      const calldata = FOUNDATION_INTERFACE.encodeFunctionData('buyV2', [MENTAL_WORLDS_ADDRESS, 32, value, REFERRER])
      planner.addCommand(CommandType.FOUNDATION, [value, calldata, ALICE_ADDRESS, MENTAL_WORLDS_ADDRESS, 32])

      const commands = planner.commands
      const inputs = planner.inputs
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
    })
  })
})
