import { CommandType, RoutePlanner } from './../shared/planner'
import { Router } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import NFTX_ZAP_ABI from './../shared/abis/NFTXZap.json'
import { resetFork, WETH } from './../shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  NFTX_COVEN_VAULT_ID,
} from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './../shared/helpers'
import hre from 'hardhat'
const { ethers } = hre

const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

describe('NFTX Gas Tests', () => {
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
    planner = new RoutePlanner()
  })

  it('gas: buyAndRedeem w/ random selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [],
      [WETH.address, '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'],
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: buyAndRedeem w/ specific selection', async () => {
    const value = expandTo18DecimalsBN(4)
    const numCovens = 2
    const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
      NFTX_COVEN_VAULT_ID,
      numCovens,
      [584, 3033],
      [WETH.address, '0xd89b16331f39ab3878daf395052851d3ac8cf3cd'],
      alice.address,
    ])

    planner.addCommand(CommandType.NFTX, [value.toString(), calldata])
    const commands = planner.commands
    const inputs = planner.inputs
    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })
})
