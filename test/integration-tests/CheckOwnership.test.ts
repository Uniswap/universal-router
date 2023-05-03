import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { ERC721, Permit2, UniversalRouter } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoTownstarsSeaport,
} from './shared/protocolHelpers/seaport'
import { resetFork, COVEN_721, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { findCustomErrorSelector } from './shared/parseEvents'
import { BigNumber, Contract } from 'ethers'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
const { ethers } = hre

describe('Check Ownership', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let cryptoCovens: ERC721

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
    cryptoCovens = COVEN_721.connect(alice)
  })

  describe('checks ownership ERC721', () => {
    it('passes with valid owner', async () => {
      const { advancedOrder } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        params.offerer,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for invalid ownership', async () => {
      const { advancedOrder } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner

      const customErrorSelector = findCustomErrorSelector(router.interface, 'InvalidOwnerERC721')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })

    it('checks ownership after a seaport trade for one ERC721', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner

      const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))
      const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
      expect(ownerAfter).to.eq(alice.address)
    })

    it('checks ownership after a seaport trade for two ERC721s', async () => {
      const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoTownstarsSeaport(alice.address)
      const params0 = advancedOrder0.parameters
      const params1 = advancedOrder1.parameters

      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params0.offer[0].identifierOrCriteria,
      ])
      planner.addCommand(CommandType.OWNER_CHECK_721, [
        alice.address,
        COVEN_ADDRESS,
        params1.offer[0].identifierOrCriteria,
      ])

      const { commands, inputs } = planner

      const owner0Before = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1Before = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const owner0After = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
      const owner1After = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)

      expect(owner0Before.toLowerCase()).to.eq(params0.offerer)
      expect(owner1Before.toLowerCase()).to.eq(params1.offerer)
      expect(owner0After).to.eq(alice.address)
      expect(owner1After).to.eq(alice.address)
    })
  })

  describe('checks ownership ERC1155', () => {
    const tokenOwner = '0x8246137C39BB05261972655186A868bdC8a9Eb11'
    const tokenAddress = '0xf4680c917A873E2dd6eAd72f9f433e74EB9c623C'
    const tokenId = 40

    it('passes with valid ownership', async () => {
      planner.addCommand(CommandType.OWNER_CHECK_1155, [tokenOwner, tokenAddress, tokenId, 1])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for invalid ownership', async () => {
      planner.addCommand(CommandType.OWNER_CHECK_1155, [alice.address, tokenAddress, tokenId, 1])

      const { commands, inputs } = planner
      const customErrorSelector = findCustomErrorSelector(router.interface, 'InvalidOwnerERC1155')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })

  describe('checks balance ERC20', () => {
    let aliceUSDCBalance: BigNumber
    let usdcContract: Contract

    before(async () => {
      usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
      aliceUSDCBalance = await usdcContract.balanceOf(ALICE_ADDRESS)
    })

    it('passes with sufficient balance', async () => {
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, aliceUSDCBalance])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for insufficient balance', async () => {
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, aliceUSDCBalance.add(1)])

      const { commands, inputs } = planner
      const customErrorSelector = findCustomErrorSelector(router.interface, 'BalanceTooLow')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})
