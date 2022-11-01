import { CommandType, RoutePlanner } from './../shared/planner'
import { Permit2, Router } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
} from './../shared/protocolHelpers/seaport'
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter, { deployPermit2 } from './../shared/deployRouter'
const { ethers } = hre

describe('Check Ownership Gas', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    planner = new RoutePlanner()
  })

  it('gas: does not check ownership after a seaport trade, one NFT', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: checks ownership after a seaport trade, one NFT', async () => {
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

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: checks ownership after a seaport trade, two NFTs', async () => {
    const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoCovensSeaport(alice.address)
    const params0 = advancedOrder0.parameters
    const params1 = advancedOrder1.parameters

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      params0.offer[0].identifierOrCriteria,
    ])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      params1.offer[0].identifierOrCriteria,
    ])

    const { commands, inputs } = planner
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

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
  })
})
