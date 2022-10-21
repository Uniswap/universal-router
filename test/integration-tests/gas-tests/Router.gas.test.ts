import { Router } from '../../../typechain'
import { expect } from '../shared/expect'
import { ALICE_ADDRESS } from '../shared/constants'
import { resetFork } from '../shared/mainnetForkHelpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter from '../shared/deployRouter'

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
    router = (await deployRouter()).connect(alice) as Router
  })

  it.only('gas: bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })
})
