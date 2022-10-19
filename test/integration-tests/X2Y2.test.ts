import { CommandType, RoutePlanner } from './shared/planner'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import X2Y2_ABI from './shared/abis/X2Y2.json'
import { Router } from '../../typechain'
import { resetFork, ENS_721, CAMEO_1155 } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  ADDRESS_ZERO,
} from './shared/constants'
import { parseEvents } from './shared/parseEvents'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
import fs from 'fs'
import { BigNumber } from 'ethers'
const { ethers } = hre

const X2Y2_INTERFACE = new ethers.utils.Interface(X2Y2_ABI)
const ERC721_INTERFACE = new ethers.utils.Interface(ERC721_ABI)
const x2y2Orders = JSON.parse(fs.readFileSync('test/integration-tests/shared/orders/X2Y2.json', { encoding: 'utf8' }))

type X2Y2Order = {
  input: string
  order_id: number
  token_id: BigNumber
  price: BigNumber
}

describe('X2Y2', () => {
  let alice: SignerWithAddress
  let router: Router
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
      const routerFactory = await ethers.getContractFactory('Router')
      router = (
        await routerFactory.deploy(
          ADDRESS_ZERO,
          V2_FACTORY_MAINNET,
          V3_FACTORY_MAINNET,
          V2_INIT_CODE_HASH_MAINNET,
          V3_INIT_CODE_HASH_MAINNET
        )
      ).connect(alice) as Router

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

    it('purchases 1 ERC-721 on X2Y2', async () => {
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc721Order.price })
      ).wait()
      const erc721TransferEvent = parseEvents(ERC721_INTERFACE, receipt)[1]?.args!

      const newOwner = await ENS_721.connect(alice).ownerOf(erc721Order.token_id)
      await expect(newOwner.toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect(erc721TransferEvent.from).to.be.eq(router.address)
      await expect(erc721TransferEvent.to.toLowerCase()).to.be.eq(ALICE_ADDRESS)
      await expect(erc721TransferEvent.id).to.be.eq(erc721Order.token_id)
    })

    it('gas purchases 1 ERC-721 on X2Y2', async () => {
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
      const routerFactory = await ethers.getContractFactory('Router')
      router = (
        await routerFactory.deploy(
          ADDRESS_ZERO,
          V2_FACTORY_MAINNET,
          V3_FACTORY_MAINNET,
          V2_INIT_CODE_HASH_MAINNET,
          V3_INIT_CODE_HASH_MAINNET
        )
      ).connect(alice) as Router

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

    it('purchases 1 ERC-1155 on X2Y2', async () => {
      await expect(await CAMEO_1155.connect(alice).balanceOf(alice.address, erc1155Order.token_id)).to.eq(0)
      await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc1155Order.price })
      ).wait()
      await expect(await CAMEO_1155.connect(alice).balanceOf(alice.address, erc1155Order.token_id)).to.eq(1)
    })

    it('gas purchases 1 ERC-1155 on X2Y2', async () => {
      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc1155Order.price })
      )
    })
  })
})
