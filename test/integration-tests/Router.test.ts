import { parseEvents, V2_EVENTS, V3_EVENTS } from './shared/parseEvents'
import { Router, ERC721 } from '../../typechain'
import type { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { Pair } from '@uniswap/v2-sdk'
import { FeeAmount } from '@uniswap/v3-sdk'
import { expect } from './shared/expect'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import NFTX_ZAP_ABI from './shared/abis/NFTXZap.json'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  OPENSEA_CONDUIT_KEY,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  NFTX_COVEN_VAULT,
  NFTX_COVEN_VAULT_ID,
} from './shared/constants'
import { seaportOrders, seaportInterface, getOrderParams } from './shared/protocolHelpers/seaport'
import { resetFork, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import {
  RouterCommand,
  RouterPlanner,
  SeaportCommand,
  NFTXCommand,
  TransferCommand,
  V2ExactInputCommand,
  V3ExactInputCommand,
} from '@uniswap/narwhal-sdk'
import { makePair, encodePath } from './shared/swapRouter02Helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'

const { ethers } = hre
const nftxZapInterface = new ethers.utils.Interface(NFTX_ZAP_ABI)

function encodePathExactInput(tokens: string[]) {
  return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
}

describe('Router', () => {
  let alice: SignerWithAddress
  let router: Router
  let daiContract: Contract
  let pair_DAI_WETH: Pair

  beforeEach(async () => {
    await resetFork()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
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

  describe('#execute', async () => {
    let planner: RouterPlanner

    beforeEach(async () => {
      planner = new RouterPlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
    })

    it('returns state', async () => {
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))

      const { commands, state } = planner.plan()
      const returnVal = await router.callStatic.executeWithDeadline(commands, state, DEADLINE)
      expect(returnVal).to.eql(state)
    })

    it('reverts if block.timestamp exceeds the deadline', async () => {
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
      const invalidDeadline = 10

      const { commands, state } = planner.plan()
      await expect(router.executeWithDeadline(commands, state, invalidDeadline)).to.be.revertedWith('TransactionDeadlinePassed()')
    })

    it('reverts for an invalid command at index 0', async () => {
      const commands = '0xffffffffffffffffffffffffffffffff'
      const state: string[] = []

      await expect(router.executeWithDeadline(commands, state, DEADLINE)).to.be.revertedWith('InvalidCommandType(31)')
    })

    it('reverts for an invalid command at index 1', async () => {
      const invalidCommand = 'ffffffffffffffffffffffffffffffff'
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      let { commands, state } = planner.plan()
      commands = commands.concat(invalidCommand)
      await expect(router.executeWithDeadline(commands, state, DEADLINE)).to.be.revertedWith('InvalidCommandType(31)')
    })

    describe('partial fills', async () => {
      let covenContract: ERC721
      let nftxValue: BigNumber
      let numCovens: number
      let invalidSeaportCommand: RouterCommand
      let value: BigNumber

      beforeEach(async () => {
        covenContract = new ethers.Contract(COVEN_ADDRESS, ERC721_ABI, alice) as ERC721
        // add valid nftx order to planner
        nftxValue = expandTo18DecimalsBN(4)
        numCovens = 2
        const calldata = nftxZapInterface.encodeFunctionData('buyAndRedeem', [
          NFTX_COVEN_VAULT_ID,
          numCovens,
          [],
          [WETH.address, NFTX_COVEN_VAULT],
          alice.address,
        ])
        planner.add(NFTXCommand(nftxValue, calldata))

        let invalidSeaportOrder = JSON.parse(JSON.stringify(seaportOrders[0]))
        invalidSeaportOrder.protocol_data.signature = '0xdeadbeef'
        const { order: seaportOrder, value: seaportValue } = getOrderParams(invalidSeaportOrder)
        const seaportCalldata = seaportInterface.encodeFunctionData('fulfillOrder', [seaportOrder, OPENSEA_CONDUIT_KEY])
        invalidSeaportCommand = SeaportCommand(seaportValue, seaportCalldata)

        value = seaportValue.add(nftxValue)
      })

      it('reverts if no commands are allowed to revert', async () => {
        planner.add(invalidSeaportCommand)

        const { commands, state } = planner.plan()
        await expect(router.executeWithDeadline(commands, state, DEADLINE, { value })).to.be.revertedWith(
          'ExecutionFailed(1, "0x8baa579f")'
        )
      })

      it('does not revert if invalid seaport transaction allowed to fail', async () => {
        planner.add(invalidSeaportCommand.allowRevert())
        const { commands, state } = planner.plan()

        const covenBalanceBefore = await covenContract.balanceOf(alice.address)
        await router.executeWithDeadline(commands, state, DEADLINE, { value })
        const covenBalanceAfter = await covenContract.balanceOf(alice.address)
        expect(covenBalanceAfter.sub(covenBalanceBefore)).to.eq(numCovens)
      })
    })

    describe('using outputs', async () => {
      it('can use an the output from a V2 swap as the input for a V3 swap', async () => {
        const pair_DAI_WETH = await makePair(alice, DAI, WETH)
        const amountIn = expandTo18DecimalsBN(100)
        const amountOutMin = 1

        planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, amountIn))
        const amountOutV2 = planner.add(V2ExactInputCommand(amountOutMin, [DAI.address, WETH.address], router.address))
        planner.add(
          V3ExactInputCommand(
            alice.address,
            amountOutV2,
            amountOutMin,
            encodePathExactInput([WETH.address, USDC.address])
          )
        )

        let { commands, state } = planner.plan()

        const receipt = await (await router.executeWithDeadline(commands, state, DEADLINE)).wait()

        const v2AmountOut = parseEvents(V2_EVENTS, receipt)[0]!.args.amount1Out
        const v3AmountIn = parseEvents(V3_EVENTS, receipt)[0]!.args.amount1

        expect(v2AmountOut).to.eq(v3AmountIn)
      })
    })
  })
})
