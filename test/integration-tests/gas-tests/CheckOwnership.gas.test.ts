import { CommandType, RoutePlanner } from './../shared/planner'
import { Router } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { seaportOrders, seaportInterface, getAdvancedOrderParams } from './../shared/protocolHelpers/seaport'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter from './../shared/deployRouter'
const { ethers } = hre

describe('Check Ownership', () => {
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

  it('gas: checks ownership after a seaport trade', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      params.offer[0].identifierOrCriteria,
    ])

    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: just ownership check', async () => {
    const { advancedOrder } = getAdvancedOrderParams(seaportOrders[0])
    const params = advancedOrder.parameters

    planner.addCommand(CommandType.OWNER_CHECK_721, [
      params.offerer,
      COVEN_ADDRESS,
      params.offer[0].identifierOrCriteria,
    ])

    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
  })
})
