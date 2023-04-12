import { UniversalRouter, Permit2, ERC20, IWETH9, MockLooksRareRewardsDistributor, ERC721 } from '../../typechain'
import { BigNumber, BigNumberish } from 'ethers'
import { Pair } from '@uniswap/v2-sdk'
import { expect } from './shared/expect'
import { abi as ROUTER_ABI } from '../../artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { abi as WETH_ABI } from '../../artifacts/contracts/interfaces/external/IWETH9.sol/IWETH9.json'

import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  DEADLINE,
  OPENSEA_CONDUIT_KEY,
  ROUTER_REWARDS_DISTRIBUTOR,
  SOURCE_MSG_SENDER,
  MAX_UINT160,
  MAX_UINT,
  ETH_ADDRESS,
  NFTX_MILADY_VAULT_ID,
} from './shared/constants'
import {
  seaportOrders,
  seaportInterface,
  getOrderParams,
  getAdvancedOrderParams,
  AdvancedOrder,
  Order,
} from './shared/protocolHelpers/seaport'
import { resetFork, WETH, DAI, COVEN_721, MILADY_721 } from './shared/mainnetForkHelpers'
import { CommandType, RoutePlanner } from './shared/planner'
import { makePair } from './shared/swapRouter02Helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
import { findCustomErrorSelector } from './shared/parseEvents'

const { ethers } = hre
const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)
const routerInterface = new ethers.utils.Interface(ROUTER_ABI)

describe.only('UniversalRouter', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let daiContract: ERC20
  let wethContract: IWETH9
  let mockLooksRareToken: ERC20
  let mockLooksRareRewardsDistributor: MockLooksRareRewardsDistributor
  let pair_DAI_WETH: Pair
  let cryptoCovens: ERC721

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })

    // mock rewards contracts
    const tokenFactory = await ethers.getContractFactory('MintableERC20')
    const mockDistributorFactory = await ethers.getContractFactory('MockLooksRareRewardsDistributor')
    mockLooksRareToken = (await tokenFactory.connect(alice).deploy(expandTo18DecimalsBN(5))) as ERC20
    mockLooksRareRewardsDistributor = (await mockDistributorFactory.deploy(
      ROUTER_REWARDS_DISTRIBUTOR,
      mockLooksRareToken.address
    )) as MockLooksRareRewardsDistributor
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice) as ERC20
    wethContract = new ethers.Contract(WETH.address, WETH_ABI, alice) as IWETH9
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (
      await deployUniversalRouter(permit2, mockLooksRareRewardsDistributor.address, mockLooksRareToken.address)
    ).connect(alice) as UniversalRouter
    cryptoCovens = COVEN_721.connect(alice) as ERC721
  })

  describe('#execute', () => {
    let planner: RoutePlanner
    const invalidCommand: string = '0x3f'

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.approve(permit2.address, MAX_UINT)
      await wethContract.approve(permit2.address, MAX_UINT)
      await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    })

    it('reverts if block.timestamp exceeds the deadline', async () => {
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        alice.address,
        1,
        1,
        [DAI.address, WETH.address],
        SOURCE_MSG_SENDER,
      ])
      const invalidDeadline = 10

      const { commands, inputs } = planner

      await expect(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, invalidDeadline)
      ).to.be.revertedWithCustomError(router, 'TransactionDeadlinePassed')
    })

    it('reverts for an invalid command at index 0', async () => {
      const inputs: string[] = ['0x12341234']

      await expect(router['execute(bytes,bytes[],uint256)'](invalidCommand, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'InvalidCommandType')
        .withArgs(parseInt(invalidCommand))
    })

    it('reverts for an invalid command at index 1', async () => {
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        DAI.address,
        pair_DAI_WETH.liquidityToken.address,
        expandTo18DecimalsBN(1),
      ])
      let commands = planner.commands
      let inputs = planner.inputs

      commands = commands.concat(invalidCommand.slice(2))
      inputs.push('0x21341234')

      await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
        .to.be.revertedWithCustomError(router, 'InvalidCommandType')
        .withArgs(parseInt(invalidCommand))
    })

    it('reverts if paying a portion over 100% of contract balance', async () => {
      await daiContract.transfer(router.address, expandTo18DecimalsBN(1))
      planner.addCommand(CommandType.PAY_PORTION, [WETH.address, alice.address, 11_000])
      planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, 1])
      const { commands, inputs } = planner
      await expect(router['execute(bytes,bytes[])'](commands, inputs)).to.be.revertedWithCustomError(
        router,
        'InvalidBips'
      )
    })

    it('reverts if a malicious contract tries to reenter', async () => {
      const reentrantProtocol = await (await ethers.getContractFactory('ReenteringProtocol')).deploy()

      router = (
        await deployUniversalRouter(
          permit2,
          mockLooksRareRewardsDistributor.address,
          mockLooksRareToken.address,
          reentrantProtocol.address
        )
      ).connect(alice) as UniversalRouter

      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, alice.address, 0])
      let { commands, inputs } = planner

      const sweepCalldata = routerInterface.encodeFunctionData('execute(bytes,bytes[])', [commands, inputs])
      const reentrantCalldata = reentrantProtocol.interface.encodeFunctionData('callAndReenter', [
        router.address,
        sweepCalldata,
      ])

      planner = new RoutePlanner()
      planner.addCommand(CommandType.NFTX, [0, reentrantCalldata])
      ;({ commands, inputs } = planner)

      const customErrorSelector = findCustomErrorSelector(reentrantProtocol.interface, 'NotAllowedReenter')
      await expect(router['execute(bytes,bytes[])'](commands, inputs))
        .to.be.revertedWithCustomError(router, 'ExecutionFailed')
        .withArgs(0, customErrorSelector)
    })

    describe('partial fills', async () => {
      let nftxValue: BigNumber
      let numMiladys: number
      let value: BigNumber
      let invalidSeaportCalldata: string
      let seaportValue: BigNumber
      let miladyContract = MILADY_721.connect(alice) as ERC721

      beforeEach(async () => {
        // Since new NFTX contract was recently released, we have to fork from a much newer block
        await resetFork(17029001) // 17029002 - 1
        // add valid nftx order to planner
        nftxValue = expandTo18DecimalsBN(2.036523961400441269)
        numMiladys = 1
        const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
          NFTX_MILADY_VAULT_ID,
          numMiladys,
          [],
          '0xd9627aa400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000001bfb8d0ff32c43470000000000000000000000000000000000000000000000000e27c49886e6000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000227c7df69d3ed1ae7574a1a7685fded90292eb48869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000465b3a7f1b643618cb',
          alice.address,
        ])
        planner.addCommand(CommandType.NFTX, [nftxValue, calldata])

        let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportOrders[0]))
        invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
        let seaportOrder: Order
        ;({ order: seaportOrder, value: seaportValue } = getOrderParams(invalidSeaportOrder))
        invalidSeaportCalldata = seaportInterface.encodeFunctionData('fulfillOrder', [
          seaportOrder,
          OPENSEA_CONDUIT_KEY,
        ])

        value = seaportValue.add(nftxValue)
      })

      it('reverts if no commands are allowed to revert', async () => {
        planner.addCommand(CommandType.SEAPORT, [seaportValue, invalidSeaportCalldata])

        const { commands, inputs } = planner

        const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
        const customErrorSelector = findCustomErrorSelector(testCustomErrors.interface, 'InvalidSignature')
        await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
          .to.be.revertedWithCustomError(router, 'ExecutionFailed')
          .withArgs(1, customErrorSelector)
      })

      it('does not revert if invalid seaport transaction allowed to fail', async () => {
        planner.addCommand(CommandType.SEAPORT, [seaportValue, invalidSeaportCalldata], true)
        const { commands, inputs } = planner

        const miladyBalanceBefore = await miladyContract.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })
        const miladyBalanceAfter = await miladyContract.balanceOf(alice.address)
        expect(miladyBalanceAfter.sub(miladyBalanceBefore)).to.eq(numMiladys)
      })
    })

    describe('ERC20 --> NFT', () => {
      let advancedOrder: AdvancedOrder
      let value: BigNumber

      beforeEach(async () => {
        ;({ advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0]))
      })

      it('completes a trade for ERC20 --> ETH --> Seaport NFT', async () => {
        const maxAmountIn = expandTo18DecimalsBN(100_000)
        const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
          advancedOrder,
          [],
          OPENSEA_CONDUIT_KEY,
          alice.address,
        ])

        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          value,
          maxAmountIn,
          [DAI.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
        const { commands, inputs } = planner
        const covenBalanceBefore = await cryptoCovens.balanceOf(alice.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const covenBalanceAfter = await cryptoCovens.balanceOf(alice.address)
        expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(1)
      })

      it('completes a trade for WETH --> ETH --> Seaport NFT', async () => {
        const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
          advancedOrder,
          [],
          OPENSEA_CONDUIT_KEY,
          alice.address,
        ])

        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [WETH.address, ADDRESS_THIS, value])
        planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])

        const { commands, inputs } = planner
        const covenBalanceBefore = await cryptoCovens.balanceOf(alice.address)
        const wethBalanceBefore = await wethContract.balanceOf(alice.address)

        await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.changeEtherBalance(
          alice,
          0
        )

        const covenBalanceAfter = await cryptoCovens.balanceOf(alice.address)
        const wethBalanceAfter = await wethContract.balanceOf(alice.address)

        expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(1)
        expect(wethBalanceBefore.sub(wethBalanceAfter)).to.eq(value)
      })
    })
  })

  describe('#collectRewards', () => {
    let amountRewards: BigNumberish
    beforeEach(async () => {
      amountRewards = expandTo18DecimalsBN(0.5)
      mockLooksRareToken.connect(alice).transfer(mockLooksRareRewardsDistributor.address, amountRewards)
    })

    it('transfers owed rewards into the distributor contract', async () => {
      const balanceBefore = await mockLooksRareToken.balanceOf(ROUTER_REWARDS_DISTRIBUTOR)
      await router.collectRewards('0x00')
      const balanceAfter = await mockLooksRareToken.balanceOf(ROUTER_REWARDS_DISTRIBUTOR)
      expect(balanceAfter.sub(balanceBefore)).to.eq(amountRewards)
    })
  })
})
