import { Router } from '../../../typechain'
import { expect } from '../shared/expect'
import {
  ALICE_ADDRESS,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from '../shared/constants'
import { resetFork } from '../shared/mainnetForkHelpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'

const { ethers } = hre

describe('Router Gas Tests', () => {
  let alice: SignerWithAddress
  let router: Router

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
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
  })

  it('bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })
})
