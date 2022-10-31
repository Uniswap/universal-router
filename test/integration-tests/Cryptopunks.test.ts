import { CommandType, RoutePlanner } from './shared/planner'
import { Router, Permit2 } from '../../typechain'
import { resetFork, CRYPTOPUNKS_MARKET } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import deployRouter, { deployPermit2 } from './shared/deployRouter'

const { ethers } = hre

describe('Cryptopunks', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let planner: RoutePlanner
  let cryptopunkContract: any

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    await resetFork(15848050)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    cryptopunkContract = CRYPTOPUNKS_MARKET.connect(alice)
  })

  // In this test we will buy crypto punk # 2976 for 74.95 ETH
  describe('Buy 1 crypto punk', () => {
    it('purchases token ids 2976', async () => {
      const value = BigNumber.from('74950000000000000000')
      planner.addCommand(CommandType.CRYPTOPUNKS, [2976, ALICE_ADDRESS, value])
      const { commands, inputs } = planner

      const aliceBalance = await ethers.provider.getBalance(alice.address)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })
      ).wait()

      // Expect that alice has the NFT
      await expect((await cryptopunkContract.punkIndexToAddress(2976)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect(aliceBalance.sub(await ethers.provider.getBalance(alice.address))).to.eq(
        value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      )
    })
  })
})
