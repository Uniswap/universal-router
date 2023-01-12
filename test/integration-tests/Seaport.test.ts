import { CommandType, RoutePlanner } from './shared/planner'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { UniversalRouter, Permit2, ERC721, ERC20 } from '../../typechain'
import {
  seaportOrders,
  seaportInterface,
  getAdvancedOrderParams,
  purchaseDataForTwoCovensSeaport,
  calculateValue,
  ItemType,
} from './shared/protocolHelpers/seaport'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { COVEN_721, resetFork, WETH } from './shared/mainnetForkHelpers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { abi as ERC20_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import {
  ALICE_ADDRESS,
  DEADLINE,
  ETH_ADDRESS,
  MSG_SENDER,
  OPENSEA_CONDUIT,
  OPENSEA_CONDUIT_KEY,
  TUBBY_ADDRESS,
} from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { getTxGasSpent } from './shared/helpers'
import { ADDRESS_ZERO } from '@uniswap/v3-sdk'
const { ethers } = hre

describe.only('Seaport', () => {
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
    cryptoCovens = COVEN_721.connect(alice) as ERC721
  })

  it('completes a fulfillAdvancedOrder type', async () => {
    const { advancedOrder, criteriaResolvers } = getAdvancedOrderParams(seaportOrders[0])
    const value = calculateValue(advancedOrder.parameters.consideration)
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      criteriaResolvers,
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = getTxGasSpent(receipt)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(ownerBefore.toLowerCase()).to.eq(params.offerer)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('revertable fulfillAdvancedOrder reverts and sweeps ETH', async () => {
    let { advancedOrder, criteriaResolvers } = getAdvancedOrderParams(seaportOrders[0])
    let value = calculateValue(advancedOrder.parameters.consideration)
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      criteriaResolvers,
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    // Allow seaport to revert
    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata], true)
    planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])

    const commands = planner.commands
    const inputs = planner.inputs

    const ownerBefore = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    // don't send enough ETH, so the seaport purchase reverts
    value = BigNumber.from(value).sub('1')
    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const ownerAfter = await cryptoCovens.ownerOf(params.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = getTxGasSpent(receipt)
    const ethDelta = ethBefore.sub(ethAfter)

    // The owner was unchanged, the user got the eth back
    expect(ownerBefore.toLowerCase()).to.eq(ownerAfter.toLowerCase())
    expect(ethDelta).to.eq(gasSpent)
  })

  it('completes a fulfillAvailableAdvancedOrders type', async () => {
    const { calldata, advancedOrder0, advancedOrder1, value } = purchaseDataForTwoCovensSeaport(alice.address)
    const params0 = advancedOrder0.parameters
    const params1 = advancedOrder1.parameters
    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    const owner0Before = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1Before = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const owner0After = await cryptoCovens.ownerOf(params0.offer[0].identifierOrCriteria)
    const owner1After = await cryptoCovens.ownerOf(params1.offer[0].identifierOrCriteria)
    const ethAfter = await ethers.provider.getBalance(alice.address)
    const gasSpent = getTxGasSpent(receipt)
    const ethDelta = ethBefore.sub(ethAfter)

    expect(owner0Before.toLowerCase()).to.eq(params0.offerer)
    expect(owner1Before.toLowerCase()).to.eq(params1.offerer)
    expect(owner0After).to.eq(alice.address)
    expect(owner1After).to.eq(alice.address)
    expect(ethDelta.sub(gasSpent)).to.eq(value)
  })

  it('reverts if order does not go through', async () => {
    let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportOrders[0]))
    invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
    const { advancedOrder: seaportOrder } = getAdvancedOrderParams(invalidSeaportOrder)
    const seaportValue = calculateValue(seaportOrder.parameters.consideration)

    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      seaportOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      alice.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [seaportValue.toString(), calldata])
    const { commands, inputs } = planner

    await expect(
      router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: seaportValue })
    ).to.be.revertedWith('ExecutionFailed(0, "0x8baa579f")')
  })

  describe.only('Seaport SELL 721', async () => {
    let tubbyCats: ERC721
    let weth: ERC20

    beforeEach(async () => {
      await resetFork(16385143) // txn is block 16385144
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
      tubbyCats = new ethers.Contract(TUBBY_ADDRESS, ERC721_ABI) as ERC721
      weth = new ethers.Contract(WETH.address, ERC20_ABI) as ERC20

      // send 1 eth from alice to router.address for weth approval
      await alice.sendTransaction({ to: router.address, value: ethers.utils.parseEther('1.0') })
      expect(await ethers.provider.getBalance(router.address)).to.eq(ethers.utils.parseEther('1.0'))
      // max approve conduit for weth
      const routerSigner = await ethers.getImpersonatedSigner(router.address)
      await weth.connect(routerSigner).approve(OPENSEA_CONDUIT, ethers.constants.MaxUint256)
      await weth.connect(routerSigner).allowance(router.address, OPENSEA_CONDUIT)
      expect(await weth.connect(routerSigner).balanceOf(router.address)).to.eq(0)
    })

    it('accepts an advanced order with criteria offering WETH', async () => {
      // https://etherscan.io/tx/0x74551f604adea1c456395a8e801bb063bbec385bdebbc025a75e0605910f493c
      let { advancedOrder, criteriaResolvers } = getAdvancedOrderParams(seaportOrders[2])
      const value = calculateValue(advancedOrder.parameters.consideration, [ItemType.ERC20])
      const params = advancedOrder.parameters
      // Can add logic to select approval target (conduit or consideration) depending on conduitHash
      // TODO: add helper function to get identifier from criteriaResolvers if exists
      const id = criteriaResolvers[0].identifier
      // transfer nft to alice as tubbyCatOwner
      const prevTubbyCatOwner = await tubbyCats.connect(alice).ownerOf(id)
      await tubbyCats
        .connect(await ethers.getImpersonatedSigner(prevTubbyCatOwner))
        .transferFrom(prevTubbyCatOwner, alice.address, id)

      const wethReceived = BigNumber.from(advancedOrder.parameters.offer[0].startAmount).sub(value)

      tubbyCats = tubbyCats.connect(alice)
      const ownerBefore = await tubbyCats.ownerOf(id)
      expect(ownerBefore).to.eq(alice.address)

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        criteriaResolvers,
        OPENSEA_CONDUIT_KEY,
        ADDRESS_ZERO, // 0 addr so router custody
      ])

      // TODO: need to add arg for msg.value?
      planner.addCommand(CommandType.SEAPORT_SELL_721, [
        calldata,
        tubbyCats.address,
        OPENSEA_CONDUIT,
        id,
        alice.address,
      ])
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 0])
      const { commands, inputs } = planner

      const wethBefore = await weth.connect(alice).balanceOf(alice.address)
      expect(wethBefore).to.eq(0)
      // put NFT in the router TODO replace with Permit2 721
      await tubbyCats.transferFrom(alice.address, router.address, id)
      expect(await tubbyCats.ownerOf(id)).to.eq(router.address)

      const ethBefore = await ethers.provider.getBalance(alice.address)
      // Send no value here bc not sending ETH
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, {})).wait()

      const ownerAfter = await tubbyCats.ownerOf(id)
      const wethAfter = await weth.connect(alice).balanceOf(alice.address)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = getTxGasSpent(receipt)
      const ethDelta = ethBefore.sub(ethAfter)

      expect(ownerBefore).to.eq(alice.address)
      expect(ownerAfter.toLowerCase()).to.eq(params.offerer.toLowerCase())
      expect(wethAfter.sub(wethBefore)).to.eq(wethReceived)
      expect(ethDelta).to.eq(gasSpent)
    })

    it('revertable order returns NFT to user if reverts', async () => {
      let { advancedOrder, criteriaResolvers } = getAdvancedOrderParams(seaportOrders[2])
      const id = criteriaResolvers[0].identifier
      // transfer nft to alice as tubbyCatOwner
      const prevTubbyCatOwner = await tubbyCats.connect(alice).ownerOf(id)
      await tubbyCats
        .connect(await ethers.getImpersonatedSigner(prevTubbyCatOwner))
        .transferFrom(prevTubbyCatOwner, alice.address, id)
      tubbyCats = tubbyCats.connect(alice)
      const ownerBefore = await tubbyCats.ownerOf(id)
      expect(ownerBefore).to.eq(alice.address)

      // Signature is invalid
      advancedOrder.signature = '0xdeadbeef'

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        criteriaResolvers,
        OPENSEA_CONDUIT_KEY,
        ADDRESS_ZERO, // 0 addr so router custody
      ])

      planner.addCommand(
        CommandType.SEAPORT_SELL_721,
        [calldata, tubbyCats.address, OPENSEA_CONDUIT, id, alice.address],
        true
      )
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 0])
      const { commands, inputs } = planner

      // TODO: replace with permit2 transfer
      await tubbyCats.transferFrom(alice.address, router.address, id)

      const wethBefore = await weth.connect(alice).balanceOf(alice.address)
      expect(wethBefore).to.eq(0)
      const ethBefore = await ethers.provider.getBalance(alice.address)
      const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, {})).wait()

      const ownerAfter = await tubbyCats.ownerOf(id)
      const wethAfter = await weth.connect(alice).balanceOf(alice.address)
      const ethAfter = await ethers.provider.getBalance(alice.address)
      const gasSpent = getTxGasSpent(receipt)
      const ethDelta = ethBefore.sub(ethAfter)

      // owner never changed and is alice still
      expect(ownerBefore).to.eq(ownerAfter)
      expect(wethAfter.eq(wethBefore)).to.be.true
      expect(ethDelta).to.eq(gasSpent)
    })

    it('reverts if order does not go through', async () => {
      let { advancedOrder, criteriaResolvers } = getAdvancedOrderParams(seaportOrders[2])
      const id = criteriaResolvers[0].identifier
      // transfer nft to alice as tubbyCatOwner
      const prevTubbyCatOwner = await tubbyCats.connect(alice).ownerOf(id)
      await tubbyCats
        .connect(await ethers.getImpersonatedSigner(prevTubbyCatOwner))
        .transferFrom(prevTubbyCatOwner, alice.address, id)
      tubbyCats = tubbyCats.connect(alice)
      const ownerBefore = await tubbyCats.ownerOf(id)
      expect(ownerBefore).to.eq(alice.address)

      // Signature is invalid
      advancedOrder.signature = '0xdeadbeef'

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        criteriaResolvers,
        OPENSEA_CONDUIT_KEY,
        ADDRESS_ZERO, // 0 addr so router custody
      ])

      planner.addCommand(CommandType.SEAPORT_SELL_721, [
        calldata,
        tubbyCats.address,
        OPENSEA_CONDUIT,
        id,
        alice.address,
      ])
      planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 0])
      const { commands, inputs } = planner

      // TODO: replace with permit2 transfer
      await tubbyCats.transferFrom(alice.address, router.address, id)

      const wethBefore = await weth.connect(alice).balanceOf(alice.address)
      expect(wethBefore).to.eq(0)
      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, {})).to.be.revertedWith(
        'ExecutionFailed(0, "0x8baa579f")'
      )

      // Note that owner here will be the router because the transfer from alice was not part of the commands
      // TODO: check this again after permit2 transfer to ensure that NFT is returned
    })
  })
})
