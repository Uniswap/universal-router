import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { ERC1155, ERC721, Permit2, UniversalRouter } from '../../typechain'
import {
  seaportV1_4Orders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoTownstarsSeaport,
  AdvancedOrder,
} from './shared/protocolHelpers/seaport'
import { resetFork, COVEN_721, USDC, TOWNSTAR_1155 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, COVEN_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY, TOWNSTAR_ADDRESS } from './shared/constants'
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
  let townStarNFT: ERC1155

  describe('checks ownership ERC721', () => {
    beforeEach(async () => {
      await resetFork(16784175)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      cryptoCovens = COVEN_721.connect(alice) as ERC721
    })

    it('passes with valid owner', async () => {
      const { advancedOrder } = getAdvancedOrderParams(seaportV1_4Orders[0])
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
      const { advancedOrder } = getAdvancedOrderParams(seaportV1_4Orders[0])
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
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const params = advancedOrder.parameters
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
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

      expect(ownerBefore.toLowerCase()).to.eq(params.offerer.toLowerCase())
      expect(ownerAfter.toLowerCase()).to.eq(alice.address.toLowerCase())
    })
  })

  describe('checks ownership ERC1155', () => {
    let calldata: string
    let advancedOrder0: AdvancedOrder
    let advancedOrder1: AdvancedOrder
    let value: BigNumber

    beforeEach(async () => {
      await resetFork(17179617)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      townStarNFT = TOWNSTAR_1155.connect(alice) as ERC1155
      ;({ calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoTownstarsSeaport(alice.address))
    })

    it('passes with valid ownership', async () => {
      const params0 = advancedOrder0.parameters

      planner.addCommand(CommandType.OWNER_CHECK_1155, [
        params0.offerer,
        TOWNSTAR_ADDRESS,
        params0.offer[0].identifierOrCriteria,
        1,
      ])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for invalid ownership', async () => {
      const params0 = advancedOrder0.parameters

      planner.addCommand(CommandType.OWNER_CHECK_1155, [
        alice.address,
        TOWNSTAR_ADDRESS,
        params0.offer[0].identifierOrCriteria,
        1,
      ])

      const { commands, inputs } = planner
      const customErrorSelector = findCustomErrorSelector(router.interface, 'InvalidOwnerERC1155')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })

    it('checks ownership after a seaport trade for two ERC1155s', async () => {
      const params0 = advancedOrder0.parameters
      const params1 = advancedOrder1.parameters

      planner.addCommand(CommandType.SEAPORT_V1_5, [value.toString(), calldata])
      planner.addCommand(CommandType.OWNER_CHECK_1155, [
        alice.address,
        TOWNSTAR_ADDRESS,
        params0.offer[0].identifierOrCriteria,
        1,
      ])
      planner.addCommand(CommandType.OWNER_CHECK_1155, [
        alice.address,
        TOWNSTAR_ADDRESS,
        params1.offer[0].identifierOrCriteria,
        1,
      ])

      const { commands, inputs } = planner

      const balance0Before = await townStarNFT.balanceOf(alice.address, params0.offer[0].identifierOrCriteria)
      const balance1Before = await townStarNFT.balanceOf(alice.address, params1.offer[0].identifierOrCriteria)

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
      ).to.changeEtherBalance(alice, value.mul(-1))

      const balance0After = await townStarNFT.balanceOf(alice.address, params0.offer[0].identifierOrCriteria)
      const balance1After = await townStarNFT.balanceOf(alice.address, params1.offer[0].identifierOrCriteria)

      expect(balance0After.sub(balance0Before)).to.eq(1)
      expect(balance1After.sub(balance1Before)).to.eq(1)
    })
  })

  describe('checks balance ERC20', () => {
    let aliceUSDCBalance: BigNumber
    let usdcContract: Contract

    beforeEach(async () => {
      await resetFork()
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
      aliceUSDCBalance = await usdcContract.balanceOf(ALICE_ADDRESS)
      planner = new RoutePlanner()
    })

    it('passes with sufficient balance', async () => {
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, aliceUSDCBalance])

      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.not.be.reverted
    })

    it('reverts for insufficient balance', async () => {
      const invalidBalance = aliceUSDCBalance.add(1)
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [ALICE_ADDRESS, USDC.address, invalidBalance])

      const { commands, inputs } = planner
      const customErrorSelector = findCustomErrorSelector(router.interface, 'BalanceTooLow')
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })
  })
})
