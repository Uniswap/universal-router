import { CommandType, RoutePlanner } from '../shared/planner'
import SUDOSWAP_ABI from '../shared/abis/Sudoswap.json'
import { UniversalRouter, Permit2, ERC721 } from '../../../typechain'
import { resetFork } from '../shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  ETH_ADDRESS,
  SUDOLETS_721,
  SUDOLETS_PAIR,
  SUDOLETS_ROUTER,
  MSG_SENDER,
} from '../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { parseEther } from 'ethers/lib/utils'
import { abi as ERC721_ABI } from '../../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
const { ethers } = hre

const SUDOSWAP_INTERFACE = new ethers.utils.Interface(SUDOSWAP_ABI)

describe('Sudoswap Gas Tests', () => {
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
    it('gas: purchases token ids 80, 35, 93 of Sudolets', async () => {
      const value = BigNumber.from('73337152777777783')
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[[SUDOLETS_PAIR, ['80', '35', '93']], value]],
        ALICE_ADDRESS,
        ALICE_ADDRESS,
        1665685098,
      ])

      planner.addCommand(CommandType.SUDOSWAP, [value, calldata])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
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

    it('gas: sell token ids 80', async () => {
      // put NFT in the router TODO replace with Permit2 721
      await sudolets.transferFrom(alice.address, router.address, 80)

      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapNFTsForToken', [
        [[[SUDOLETS_PAIR, ['80']], '0']],
        ALICE_ADDRESS,
        DEADLINE,
      ])

      planner.addCommand(CommandType.SUDOSWAP_SELL, [calldata, SUDOLETS_721, SUDOLETS_ROUTER, 80, ALICE_ADDRESS])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })
  })
})
