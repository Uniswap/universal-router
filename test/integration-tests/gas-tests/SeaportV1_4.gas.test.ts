import { CommandType, RoutePlanner } from '../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { seaportV1_4Orders, seaportV1_4Interface, getAdvancedOrderParams } from '../shared/protocolHelpers/seaport'
import { resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
const { ethers } = hre

describe('Seaport v1.4 Gas Tests', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  describe('ETH -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16784176 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
    })

    it('gas: fulfillAdvancedOrder', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const calldata = seaportV1_4Interface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })
})
