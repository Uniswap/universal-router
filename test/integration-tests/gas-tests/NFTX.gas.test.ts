import { CommandType, RoutePlanner } from './../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import NFTX_ZAP_ABI from './../shared/abis/NFTXZap.json'
import { resetFork, WETH } from './../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, NFTX_COVEN_VAULT_ID } from './../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './../shared/helpers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
const { ethers } = hre

const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

describe('NFTX Gas Tests', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
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
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    planner = new RoutePlanner()
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
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })
})
