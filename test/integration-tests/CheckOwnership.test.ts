import type { Contract } from '@ethersproject/contracts'
import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { Router } from '../../typechain'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { seaportOrders, seaportInterface, getAdvancedOrderParams } from './shared/protocolHelpers/seaport'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import deployRouter from './shared/deployRouter'
const { ethers } = hre

describe('Check Ownership', () => {
  let alice: SignerWithAddress
  let router: Router
  let covenContract: Contract
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice)
    router = (await deployRouter()).connect(alice) as Router
    planner = new RoutePlanner()
  })

  it('checks ownership after a seaport trade', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      params.offer[0].identifierOrCriteria,
    ])

    const commands = planner.commands
    const inputs = planner.inputs

    const ownerBefore = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const ownerAfter = await covenContract.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('check ownership reverts for incorrect ID', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    planner.addCommand(CommandType.OWNER_CHECK_721, [
      alice.address,
      COVEN_ADDRESS,
      BigNumber.from(params.offer[0].identifierOrCriteria).sub('1'),
    ])

    const commands = planner.commands
    const inputs = planner.inputs

    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.be.revertedWith(
      'ExecutionFailed(1, "0x")'
    )
  })
})
