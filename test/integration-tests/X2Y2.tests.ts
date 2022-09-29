import { RouterPlanner, X2Y2Command } from '@uniswap/narwhal-sdk'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import X2Y2_ABI from './shared/abis/X2Y2.json'
import { Router } from '../../typechain'
import { resetFork, ENS_NFT } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import parseEvents from './shared/parseEvents'
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
  let planner: RouterPlanner

  beforeEach(async () => {
    // in beforeEach not afterEach as these tests use a different block
    await resetFork()

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    const routerFactory = await ethers.getContractFactory('Router')
    router = (
      await routerFactory.deploy(
        ethers.constants.AddressZero,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
    planner = new RouterPlanner()
  })

  it('purchases 1 NFT on X2Y2', async () => {
    const x2y2Order: X2Y2Order = x2y2Orders[0].data[0]

    const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
    const calldata = functionSelector + x2y2Order.input.slice(2)

    planner.add(X2Y2Command(x2y2Order.price, calldata, ALICE_ADDRESS, ENS_NFT.address, x2y2Order.token_id))
    const { commands, state } = planner.plan()

    const receipt = await (await router.execute(DEADLINE, commands, state, { value: x2y2Order.price })).wait()
    const events = parseEvents(ERC721_INTERFACE, receipt)

    const newOwner = await ENS_NFT.connect(alice).ownerOf(x2y2Order.token_id)
    await expect(newOwner.toLowerCase()).to.eq(ALICE_ADDRESS)

    await expect(events[1]?.args.from).to.be.eq(router.address)
    await expect(events[1]?.args.to.toLowerCase()).to.be.eq(ALICE_ADDRESS)
    await expect(events[1]?.args.id).to.be.eq(x2y2Order.token_id)
  })

  it('gas purchases 1 NFT on X2Y2', async () => {
    const x2y2Order: X2Y2Order = x2y2Orders[0].data[0]

    const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
    const calldata = functionSelector + x2y2Order.input.slice(2)

    planner.add(X2Y2Command(x2y2Order.price, calldata, ALICE_ADDRESS, ENS_NFT.address, x2y2Order.token_id))
    const { commands, state } = planner.plan()
    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value: x2y2Order.price }))
  })
})
