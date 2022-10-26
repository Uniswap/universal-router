import { CommandType, RoutePlanner } from './../shared/planner'
import { Router, Permit2 } from '../../../typechain-types'
import { resetFork, ENS_721 } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { X2Y2Order, x2y2Orders, X2Y2_INTERFACE } from '../shared/protocolHelpers/x2y2'
import deployRouter, { deployPermit2 } from '../shared/deployRouter'
const { ethers } = hre

describe('X2Y2', () => {
  let alice: SignerWithAddress
  let router: Router
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  describe('ERC-721 purchase', () => {
    let commands: string
    let inputs: string[]
    let erc721Order: X2Y2Order

    beforeEach(async () => {
      await resetFork()
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployRouter(permit2)).connect(alice) as Router

      erc721Order = x2y2Orders[0]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc721Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_721, [
        erc721Order.price,
        calldata,
        ALICE_ADDRESS,
        ENS_721.address,
        erc721Order.token_id,
      ])
      commands = planner.commands
      inputs = planner.inputs
    })

    it('gas: purchases 1 ERC-721 on X2Y2', async () => {
      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc721Order.price })
      )
    })
  })

  describe('ERC-1155 purchase', () => {
    let commands: string
    let inputs: string[]
    let erc1155Order: X2Y2Order

    beforeEach(async () => {
      await resetFork(15650000)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployRouter(permit2)).connect(alice) as Router

      erc1155Order = x2y2Orders[1]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc1155Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_1155, [
        erc1155Order.price,
        calldata,
        ALICE_ADDRESS,
        '0x93317E87a3a47821803CAADC54Ae418Af80603DA',
        erc1155Order.token_id,
        1,
      ])
      commands = planner.commands
      inputs = planner.inputs
    })

    it('gas: purchases 1 ERC-1155 on X2Y2', async () => {
      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc1155Order.price })
      )
    })
  })
})
