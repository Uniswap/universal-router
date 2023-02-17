import { CommandType, RoutePlanner } from './shared/planner'
import NFT20_ABI from './shared/abis/NFT20.json'
import { UniversalRouter, Permit2, ERC721 } from '../../typechain'
import { ALPHABETTIES_721, resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, ALPHABETTIES_ADDRESS, DEADLINE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
const { ethers } = hre

const NFT20_INTERFACE = new ethers.utils.Interface(NFT20_ABI)

describe('NFT20', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
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
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    alphabetties = ALPHABETTIES_721.connect(alice) as ERC721
  })

  // In this test we will buy token ids 129, 193, 278 of Alphabetties (0x6d05064fe99e40f1c3464e7310a23ffaded56e20).
  // We will send 0.021~ ETH (20583701229648230 wei), and we will get refunded 1086067487962785 wei
  describe('Buy 3 alphabetties from NFT20', () => {
    it('purchases token ids 129, 193, 278 of Alphabetties', async () => {
      const toSend = BigNumber.from('20583701229648230')
      const expectedRefund = BigNumber.from('1086067487962785')
      const calldata = NFT20_INTERFACE.encodeFunctionData('ethForNft', [
        ALPHABETTIES_ADDRESS,
        ['129', '193', '278'],
        ['1', '1', '1'],
        ALICE_ADDRESS,
        0,
        false,
      ])
      planner.addCommand(CommandType.NFT20, [toSend, calldata])

      const { commands, inputs } = planner
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: toSend })
      ).to.changeEtherBalance(alice, toSend.sub(expectedRefund).mul(-1))

      // Expect that alice has the NFTs
      await expect((await alphabetties.ownerOf(129)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await alphabetties.ownerOf(193)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await alphabetties.ownerOf(278)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })
})
