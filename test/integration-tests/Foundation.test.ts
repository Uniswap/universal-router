import FOUNDATION_ABI from './shared/abis/Foundation.json'
import { UniversalRouter, Permit2 } from '../../typechain'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { resetFork, MENTAL_WORLDS_721 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MENTAL_WORLDS_ADDRESS } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import { CommandType, RoutePlanner } from './shared/planner'
const { ethers } = hre

const FOUNDATION_INTERFACE = new ethers.utils.Interface(FOUNDATION_ABI)
const REFERRER = '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C'

describe('Foundation', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  // In this test we will buy token id 32 of mental worlds NFT (0xEf96021Af16BD04918b0d87cE045d7984ad6c38c),
  // which costs 0.01 ETH
  describe('Buy a mental worlds NFT from Foundation', () => {
    beforeEach(async () => {
      await resetFork(15725945)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    })

    it('purchases token id 32 of mental worlds', async () => {
      const value = BigNumber.from('10000000000000000')
      const calldata = FOUNDATION_INTERFACE.encodeFunctionData('buyV2', [MENTAL_WORLDS_ADDRESS, 32, value, REFERRER])
      planner.addCommand(CommandType.FOUNDATION, [value, calldata, ALICE_ADDRESS, MENTAL_WORLDS_ADDRESS, 32])
      const { commands, inputs } = planner

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalances([alice, REFERRER], [value.mul(-1), value.div(100)])

      // Expect that alice has the NFT
      await expect((await MENTAL_WORLDS_721.connect(alice).ownerOf(32)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })
})
