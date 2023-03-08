import { CommandType, RoutePlanner } from '../shared/planner'
import ELEMENT_ABI from '../shared/abis/Element.json'
import { UniversalRouter, Permit2 } from '../../../typechain'
import { resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from '../shared/constants'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { EXAMPLE_ETH_SELL_ORDER, EXAMPLE_ETH_SELL_ORDER_SIG } from '../shared/protocolHelpers/element'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)

describe('Element Market gas tests', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  const order = EXAMPLE_ETH_SELL_ORDER
  const signature = EXAMPLE_ETH_SELL_ORDER_SIG

  beforeEach(async () => {
    // txn is at block 16627214
    await resetFork(16627214 - 1)
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
  })

  it('gas: purchases open order', async () => {
    const value = BigNumber.from(order.erc20TokenAmount)
    const calldata = ELEMENT_721_INTERFACE.encodeFunctionData('buyERC721Ex', [
      order,
      signature,
      order.taker, // taker
      '0x', // extraData
    ])

    planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })
})
