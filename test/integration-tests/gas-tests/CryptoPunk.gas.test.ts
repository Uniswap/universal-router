import { CommandType, RoutePlanner } from '../shared/planner'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { UniversalRouter, Permit2 } from '../../../typechain'
import { resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'

const { ethers } = hre

describe('Cryptopunks', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)

    await resetFork(15848050)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
  })

  it('purchases 1 cryptopunk gas', async () => {
    const value = BigNumber.from('74950000000000000000')
    planner.addCommand(CommandType.CRYPTOPUNKS, [2976, ALICE_ADDRESS, value])
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value }))
  })
})
