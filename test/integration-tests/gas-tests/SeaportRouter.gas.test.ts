import { CommandType, RoutePlanner } from '../shared/planner'
import { Router } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { seaportOrders, seaportInterface, getAdvancedOrderParams } from '../shared/protocolHelpers/seaport'
import { resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter from '../shared/deployRouter'
const { ethers } = hre

describe('Seaport Gas Tests', () => {
  let alice: SignerWithAddress
  let router: Router
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    router = (await deployRouter()).connect(alice) as Router
    planner = new RoutePlanner()
  })

  it('gas: fulfillAdvancedOrder', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: fulfillAvailableAdvancedOrders 1 orders', async () => {
    const { advancedOrder: advancedOrder0, value: value1 } = getAdvancedOrderParams(seaportOrders[0])
    const { advancedOrder: advancedOrder1, value: value2 } = getAdvancedOrderParams(seaportOrders[1])
    const value = value1.add(value2)
    const considerationFulfillment = [
      [[0, 0]],
      [
        [0, 1],
        [1, 1],
      ],
      [
        [0, 2],
        [1, 2],
      ],
      [[1, 0]],
    ]

    const calldata = seaportInterface.encodeFunctionData('fulfillAvailableAdvancedOrders', [
      [advancedOrder0, advancedOrder1],
      [],
      [[[0, 0]], [[1, 0]]],
      considerationFulfillment,
      OPENSEA_CONDUIT_KEY,
      alice.address,
      100,
    ])

    planner.addCommand(CommandType.SEAPORT, [value, calldata])
    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })
})
