import { CommandType, RoutePlanner } from './shared/planner'
import SUDOSWAP_ABI from './shared/abis/Sudoswap.json'
import { ERC721, UniversalRouter, Permit2, ERC20 } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import { DEADLINE } from './shared/constants'
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
export const FRAX_ADDRESS = '0x853d955acef822db058eb8505911ed77f175b99e'

describe('Sudoswap', () => {
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork(16643381) // use recent block
    planner = new RoutePlanner()
    bob = (await ethers.getSigners())[1]
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
  })

  describe('Buy with ETH', () => {
    let sudolets: ERC721

    beforeEach(async () => {
      sudolets = new ethers.Contract(SUDOLETS_ADDRESS, ERC721_ABI).connect(bob) as ERC721
    })

    // In this test we will buy token ids 173, 239, 240 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
    // which costs 0.073 ETH (exactly 73337152777777692 wei)
    it('purchases token ids 173, 239, 240 of Sudolets', async () => {
      const value = BigNumber.from('73337152777777692')
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[['0x339e7004372e04b1d59443f0ddc075efd9d80360', ['173', '239', '240']], value]],
        bob.address,
        bob.address,
        1700000000,
      ])
      planner.addCommand(CommandType.SUDOSWAP, [value, calldata])

      const { commands, inputs } = planner
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(bob, value.mul(-1))

      // Expect that bob has the NFTs
      expect(await sudolets.ownerOf(173)).to.eq(bob.address)
      expect(await sudolets.ownerOf(173)).to.eq(bob.address)
      expect(await sudolets.ownerOf(240)).to.eq(bob.address)
    })
  })

  describe('Buy using ERC20', () => {
    let fraxToken: ERC20
    let basedGhoul: ERC721

    beforeEach(async () => {
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
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapERC20ForSpecificNFTs', [
        [[[ghlFraxPairAddress, ['2402', '2509']], value]],
        value,
        bob.address,
        1700000000,
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

      planner.addCommand(CommandType.APPROVE_ERC20, [fraxToken.address, 1])
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [fraxToken.address, router.address, value])
      planner.addCommand(CommandType.SUDOSWAP, [0, calldata])
      const { commands, inputs } = planner

      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })

      // Expect that bob has the NFTs
      expect(await basedGhoul.ownerOf(2402)).to.eq(bob.address)
      expect(await basedGhoul.ownerOf(2509)).to.eq(bob.address)
    })

    it('buys NFTs with ERC20 already approved', async () => {
      planner.addCommand(CommandType.APPROVE_ERC20, [fraxToken.address, 1])
      await router['execute(bytes,bytes[],uint256)'](planner.commands, planner.inputs, DEADLINE, { value: 0 })

      const value = BigNumber.from('226492000000000000000')
      const ghlFraxPairAddress = '0x9c9604405dea60d5AC4433FCf87D76a0bC6bB68B'
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapERC20ForSpecificNFTs', [
        [[[ghlFraxPairAddress, ['2402', '2509']], value]],
        value,
        bob.address,
        1700000000,
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

      planner = new RoutePlanner()
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
