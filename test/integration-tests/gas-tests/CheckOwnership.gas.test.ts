import { CommandType, RoutePlanner } from './../shared/planner'
import { Permit2, UniversalRouter } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {
  seaportV1_4Orders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoTownstarsSeaport,
} from './../shared/protocolHelpers/seaport'
import { resetFork, USDC } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY, TOWNSTAR_ADDRESS } from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from './../shared/deployUniversalRouter'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
const { ethers } = hre

describe('Check Ownership Gas', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork(16784175)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  it('gas: does not check ownership after a seaport trade, one NFT', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: checks ownership after a seaport trade, one NFT', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      params.offer[0].identifierOrCriteria,
    ])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: checks ownership after a seaport trade, two NFTs', async () => {
    await resetFork(17179617)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()

    const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoTownstarsSeaport(alice.address)
    const params0 = advancedOrder0.parameters
    const params1 = advancedOrder1.parameters

    planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_1155, [
      alice.address,
      TOWNSTAR_ADDRESS,
      params0.offer[0].identifierOrCriteria,
      1,
    ])
    planner.addCommand(CommandType.OWNER_CHECK_1155, [
      alice.address,
      TOWNSTAR_ADDRESS,
      params1.offer[0].identifierOrCriteria,
      1,
    ])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: just ownership check', async () => {
    const { advancedOrder } = getAdvancedOrderParams(seaportV1_4Orders[0])
    const params = advancedOrder.parameters

    planner.addCommand(CommandType.OWNER_CHECK_721, [
      params.offerer,
      COVEN_ADDRESS,
      params.offer[0].identifierOrCriteria,
    ])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
  })

  it('gas: balance check ERC20', async () => {
    const usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const aliceUSDCBalance = await usdcContract.balanceOf(ALICE_ADDRESS)

    planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, aliceUSDCBalance])

    const { commands, inputs } = planner
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
  })
})
