import { Router, Permit2 } from '../../../typechain'
import { expect } from '../shared/expect'
import type { Contract } from '@ethersproject/contracts'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { resetFork, WETH, DAI } from '../shared/mainnetForkHelpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expandTo18DecimalsBN } from '../shared/helpers'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  AdvancedOrder,
} from '../shared/protocolHelpers/seaport'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import { BigNumber } from 'ethers'

const { ethers } = hre

describe('Router Gas Tests', () => {
  let alice: SignerWithAddress
  let planner: RoutePlanner
  let router: Router
  let permit2: Permit2
  let daiContract: Contract

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployRouter(permit2)).connect(alice) as Router
    planner = new RoutePlanner()
  })

  it('gas: bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('trading for NFTs', async () => {
    let advancedOrder: AdvancedOrder
    let value: BigNumber

    beforeEach(async () => {
      ;({ advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0]))
    })

    it('gas: ETH --> Seaport NFT', async () => {
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

    it('gas: ERC20 --> ETH --> Seaport NFT', async () => {
      const maxAmountIn = expandTo18DecimalsBN(100_000)
      await daiContract.transfer(router.address, maxAmountIn)
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        value,
        maxAmountIn,
        [DAI.address, WETH.address],
        router.address,
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, value])
      planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })
})
