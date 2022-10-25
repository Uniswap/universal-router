import { CommandType, RoutePlanner } from '../shared/planner'
import SUDOSWAP_ABI from '../shared/abis/Sudoswap.json'
import { Router } from '../../../typechain'
import { resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from '../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import deployRouter from '../shared/deployRouter'
const { ethers } = hre

const SUDOSWAP_INTERFACE = new ethers.utils.Interface(SUDOSWAP_ABI)

describe('Sudoswap Gas Tests', () => {
  let alice: SignerWithAddress
  let router: Router
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  // In this test we will buy token ids 80, 35, 93 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
  // which costs 0.073 ETH (exactly 73337152777777783 wei)
  describe('Buy 3 sudolets from sudoswap', () => {
    beforeEach(async () => {
      await resetFork(15740629)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      router = (await deployRouter()).connect(alice) as Router
    })

    it('gas: purchases token ids 80, 35, 93 of Sudolets', async () => {
      const value = BigNumber.from('73337152777777783')
      const calldata = SUDOSWAP_INTERFACE.encodeFunctionData('robustSwapETHForSpecificNFTs', [
        [[['0x339e7004372e04b1d59443f0ddc075efd9d80360', ['80', '35', '93']], '73337152777777783']],
        ALICE_ADDRESS,
        ALICE_ADDRESS,
        1665685098,
      ])

      planner.addCommand(CommandType.SUDOSWAP, [value, calldata])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
    })
  })
})
