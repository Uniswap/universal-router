import { CommandType, RoutePlanner } from './../shared/planner'
import NFT20_ABI from './../shared/abis/NFT20.json'
import { UniversalRouter, Permit2 } from '../../../typechain'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, ALPHABETTIES_ADDRESS, DEADLINE } from './../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
const { ethers } = hre

const NFT20_INTERFACE = new ethers.utils.Interface(NFT20_ABI)

describe('NFT20', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    await resetFork(15770228)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
  })

  // In this test we will buy token ids 129, 193, 278 of Alphabetties (0x6d05064fe99e40f1c3464e7310a23ffaded56e20).
  // We will send 0.021~ ETH (20583701229648230 wei), and we will get refunded 1086067487962785 wei
  describe('Buy 3 alphabetties from NFT20', () => {
    it('gas: purchases token ids 129, 193, 278 of Alphabetties', async () => {
      const value = BigNumber.from('20583701229648230')
      const calldata = NFT20_INTERFACE.encodeFunctionData('ethForNft', [
        ALPHABETTIES_ADDRESS,
        ['129', '193', '278'],
        ['1', '1', '1'],
        ALICE_ADDRESS,
        0,
        false,
      ])
      planner.addCommand(CommandType.NFT20, [value, calldata])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
    })
  })
})
