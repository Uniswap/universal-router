import { UniversalRouter, Permit2, IWETH9, ERC20 } from '../../../typechain'
import { expect } from '../shared/expect'
import {
  ALICE_ADDRESS,
  ADDRESS_THIS,
  DEADLINE,
  MAX_UINT,
  MAX_UINT160,
  OPENSEA_CONDUIT_KEY,
  SOURCE_MSG_SENDER,
} from '../shared/constants'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { abi as WETH_ABI } from '../../../artifacts/contracts/interfaces/external/IWETH9.sol/IWETH9.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { resetFork, WETH, DAI } from '../shared/mainnetForkHelpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expandTo18DecimalsBN } from '../shared/helpers'
import {
  seaportV1_5Orders,
  seaportInterface,
  getAdvancedOrderParams,
  AdvancedOrder,
} from '../shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import { BigNumber } from 'ethers'

const { ethers } = hre

describe('UniversalRouter Gas Tests', () => {
  let alice: SignerWithAddress
  let planner: RoutePlanner
  let router: UniversalRouter
  let permit2: Permit2
  let daiContract: ERC20
  let wethContract: IWETH9

  beforeEach(async () => {
    await resetFork(17179617)
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice) as ERC20
    wethContract = new ethers.Contract(WETH.address, WETH_ABI, alice) as IWETH9
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
  })

  it('gas: bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('trading for NFTs', async () => {
    let advancedOrder: AdvancedOrder
    let value: BigNumber

    beforeEach(async () => {
      ;({ advancedOrder, value } = getAdvancedOrderParams(seaportV1_5Orders[0]))
      await daiContract.approve(permit2.address, MAX_UINT)
      await wethContract.approve(permit2.address, MAX_UINT)
      await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    })

    it('gas: ETH --> Seaport NFT', async () => {
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })

    it('gas: ERC20 --> ETH --> Seaport NFT', async () => {
      const maxAmountIn = expandTo18DecimalsBN(100_000)
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        router.address,
        value,
        maxAmountIn,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, value])
      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })

    it('gas: WETH --> ETH --> Seaport NFT', async () => {
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [WETH.address, ADDRESS_THIS, value])
      planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, value])
      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])

      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })
})
