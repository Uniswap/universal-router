import { CommandType, RoutePlanner } from './../shared/planner'
<<<<<<< HEAD
import { Router } from '../../../typechain'
=======
import { UniversalRouter, Permit2 } from '../../../typechain'
>>>>>>> origin/main
import { resetFork } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, ENS_NFT_ADDRESS, CAMEO_ADDRESS } from './../shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { X2Y2Order, x2y2Orders, X2Y2_INTERFACE } from '../shared/protocolHelpers/x2y2'
<<<<<<< HEAD
import { deployRouterAndPermit2 } from '../shared/deployRouter'
=======
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
>>>>>>> origin/main
const { ethers } = hre

describe('X2Y2', () => {
  let alice: SignerWithAddress
<<<<<<< HEAD
  let router: Router
=======
  let router: UniversalRouter
  let permit2: Permit2
>>>>>>> origin/main
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
<<<<<<< HEAD
      const [routerContract] = await deployRouterAndPermit2()
      router = routerContract.connect(alice) as Router
=======
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
>>>>>>> origin/main

      erc721Order = x2y2Orders[0]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc721Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_721, [
        erc721Order.price,
        calldata,
        ALICE_ADDRESS,
        ENS_NFT_ADDRESS,
        erc721Order.token_id,
      ])
      ;({ commands, inputs } = planner)
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
<<<<<<< HEAD
      const [routerContract] = await deployRouterAndPermit2()
      router = routerContract.connect(alice) as Router
=======
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
>>>>>>> origin/main

      erc1155Order = x2y2Orders[1]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc1155Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_1155, [
        erc1155Order.price,
        calldata,
        ALICE_ADDRESS,
        CAMEO_ADDRESS,
        erc1155Order.token_id,
        1,
      ])
      ;({ commands, inputs } = planner)
    })

    it('gas: purchases 1 ERC-1155 on X2Y2', async () => {
      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc1155Order.price })
      )
    })
  })
})
