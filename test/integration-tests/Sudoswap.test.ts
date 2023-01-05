import { CommandType, RoutePlanner } from './shared/planner'
import SUDOSWAP_ABI from './shared/abis/Sudoswap.json'
import { ERC721, UniversalRouter, Permit2 } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ETH_ADDRESS, SUDOLETS_721, SUDOLETS_PAIR, SUDOLETS_ROUTER } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { expect } from 'chai'
import { parseEther } from 'ethers/lib/utils'
import { MSG_SENDER } from '@uniswap/router-sdk'
import { getTxGasSpent } from './shared/helpers'

const { ethers } = hre

const SUDOSWAP_INTERFACE = new ethers.utils.Interface(SUDOSWAP_ABI)

describe('Sudoswap', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let sudolets: ERC721

  beforeEach(async () => {
    await resetFork(15740629)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter

    sudolets = new ethers.Contract(SUDOLETS_721, ERC721_ABI).connect(alice) as ERC721
    planner = new RoutePlanner()
  })

  // In this test we will buy token ids 80, 35, 93 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
  // which costs 0.073 ETH (exactly 73337152777777783 wei)
  describe('Buy 3 sudolets from sudoswap', () => {
    const price = BigNumber.from('73337152777777783')

    it('purchases token ids 80, 35, 93 of Sudolets', async () => {
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[[SUDOLETS_PAIR, ['80', '35', '93']], price]],
        ALICE_ADDRESS,
        ALICE_ADDRESS,
        1665685098,
      ])
      planner.addCommand(CommandType.SUDOSWAP, [price, calldata])
      const { commands, inputs } = planner

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: price })
      ).wait()

      // Expect that alice has the NFTs
      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await sudolets.ownerOf(35)).toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect((await sudolets.ownerOf(93)).toLowerCase()).to.eq(ALICE_ADDRESS)
      // Expect that alice's account has 0.073 (plus gas) less ETH in it

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address)

      await expect(aliceBalanceBefore.sub(aliceBalanceAfter)).to.eq(price.add(getTxGasSpent(receipt)))
    })
  })

  // In this test we will sell token id 80 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
  describe('Sell a sudolet on sudoswap', () => {
    // to sell we must first buy one - send 1 eth and receive change
    beforeEach(async () => {
      const oneEther = parseEther('1')

      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[[SUDOLETS_PAIR, ['80']], oneEther]],
        ALICE_ADDRESS,
        ALICE_ADDRESS,
        1665685098,
      ])
      planner.addCommand(CommandType.SUDOSWAP, [oneEther, calldata])
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])
      const { commands, inputs } = planner

      await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: oneEther })).wait()

      planner = new RoutePlanner()
    })

    it('sell token ids 80', async () => {
      // put NFT in the router TODO replace with Permit2 721
      await sudolets.transferFrom(alice.address, router.address, 80)
      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(router.address.toLowerCase())

      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapNFTsForToken', [
        [[[SUDOLETS_PAIR, ['80']], '0']],
        ALICE_ADDRESS,
        DEADLINE,
      ])
      const ethReceived = BigNumber.from('18046875000000002')

      planner.addCommand(CommandType.SUDOSWAP_SELL, [calldata, SUDOLETS_721, SUDOLETS_ROUTER, 80, ALICE_ADDRESS])
      const { commands, inputs } = planner

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()

      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(SUDOLETS_PAIR)

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address)

      await expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.eq(ethReceived.sub(getTxGasSpent(receipt)))
    })

    it('fails to sell token and returns NFT when revert is permitted', async () => {
      // put NFT in the router TODO replace with Permit2 721
      await sudolets.transferFrom(alice.address, router.address, 80)
      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(router.address.toLowerCase())

      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapNFTsForToken', [
        [[[SUDOLETS_PAIR, ['80']], '0']],
        ALICE_ADDRESS,
        1, // deadline in the past
      ])

      planner.addCommand(CommandType.SUDOSWAP_SELL, [calldata, SUDOLETS_721, SUDOLETS_ROUTER, 80, ALICE_ADDRESS], true)
      const { commands, inputs } = planner

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).wait()

      await expect((await sudolets.ownerOf(80)).toLowerCase()).to.eq(ALICE_ADDRESS)

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address)

      await expect(aliceBalanceBefore.sub(aliceBalanceAfter)).to.eq(getTxGasSpent(receipt))
    })
  })
})
