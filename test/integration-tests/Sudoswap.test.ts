import { CommandType, RoutePlanner } from './shared/planner'
import SUDOSWAP_ABI from './shared/abis/Sudoswap.json'
import { ERC721, UniversalRouter, Permit2, ERC20 } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC20_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { expect } from 'chai'
import { getPermitSignature } from './shared/protocolHelpers/permit2'

const { ethers } = hre

const SUDOSWAP_INTERFACE = new ethers.utils.Interface(SUDOSWAP_ABI)
const SUDOLETS_ADDRESS = '0xfa9937555dc20a020a161232de4d2b109c62aa9c'
const BASED_GHOUL_ADDRESS = '0xeF1a89cbfAbE59397FfdA11Fc5DF293E9bC5Db90'
const FRAX_ADDRESS = '0x853d955acef822db058eb8505911ed77f175b99e'

describe.only('Sudoswap', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  // In this test we will buy token ids 80, 35, 93 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
  // which costs 0.073 ETH (exactly 73337152777777783 wei)
  describe('Buy 3 sudolets from sudoswap', () => {
    let sudolets: ERC721

    beforeEach(async () => {
      await resetFork(15740629)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter

      sudolets = new ethers.Contract(SUDOLETS_ADDRESS, ERC721_ABI).connect(alice) as ERC721
    })

    it('purchases token ids 80, 35, 93 of Sudolets', async () => {
      const value = BigNumber.from('73337152777777783')
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[['0x339e7004372e04b1d59443f0ddc075efd9d80360', ['80', '35', '93']], '73337152777777783']],
        ALICE_ADDRESS,
        ALICE_ADDRESS,
        1665685098,
      ])
      planner.addCommand(CommandType.SUDOSWAP, [value, calldata])

      const { commands, inputs } = planner
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      // Expect that alice has the NFTs
      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await sudolets.ownerOf(35)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await sudolets.ownerOf(93)).toLowerCase()).to.eq(ALICE_ADDRESS)
    })
  })

  // Buy tokens 2402, 2509 of Based Ghoul (0xeF1a89cbfAbE59397FfdA11Fc5DF293E9bC5Db90)
  describe('Buy using ERC20', () => {
    let bob: SignerWithAddress
    let fraxToken: ERC20
    let basedGhoul: ERC721

    beforeEach(async () => {
      await resetFork(16643381) // use recent block
      bob = (await ethers.getSigners())[1]
      permit2 = (await deployPermit2()).connect(bob) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter

      basedGhoul = new ethers.Contract(BASED_GHOUL_ADDRESS, ERC721_ABI).connect(bob) as ERC721
      fraxToken = new ethers.Contract(FRAX_ADDRESS, ERC20_ABI).connect(bob) as ERC20

      const fraxWhaleSinger = await ethers.getImpersonatedSigner('0x839f654749F493f5407bde26556E5052376f144E')
      // transfer FRAX from whale to bob
      await fraxToken.connect(fraxWhaleSinger).transfer(bob.address, ethers.utils.parseEther('10000'))
      // approve permit2 for all for bob's frax
      await fraxToken.connect(bob).approve(permit2.address, ethers.constants.MaxUint256)
    })

    // buying 2 NFTs will cost exactly 226.492 FRAX
    it('it buys tokens 2402, 2509 with FRAX ERC20 token', async () => {
      const value = BigNumber.from('226492000000000000000')
      const ghlFraxPairAddress = '0x9c9604405dea60d5AC4433FCf87D76a0bC6bB68B'
      // robustSwapERC20ForSpecificNFTs
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapERC20ForSpecificNFTs', [
        [
          [
            [ghlFraxPairAddress, ['2402', '2509']],
            value, // max cost of the total trade
          ],
        ],
        value,
        bob.address,
        1776575269,
      ])

      const permit = {
        details: {
          token: fraxToken.address,
          amount: value,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      planner.addCommand(CommandType.APPROVE_ERC20, [fraxToken.address, 2])
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [fraxToken.address, router.address, value])
      planner.addCommand(CommandType.SUDOSWAP, [0, calldata])
      const { commands, inputs } = planner

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })

      // Expect that bob has the NFTs
      expect(await basedGhoul.ownerOf(2402)).to.eq(bob.address)
      expect(await basedGhoul.ownerOf(2509)).to.eq(bob.address)
    })
  })
})
