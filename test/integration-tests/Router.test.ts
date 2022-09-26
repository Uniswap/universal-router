import { WeirollRouter } from '../../typechain'
import type { Contract } from '@ethersproject/contracts'
import { Pair } from '@uniswap/v2-sdk'
import { expect } from './shared/expect'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import { WETH, DAI } from './shared/mainnetForkHelpers'
import { RouterPlanner, TransferCommand, V2ExactInputCommand } from '@uniswap/narwhal-sdk'
import { makePair } from './shared/swapRouter02Helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expandTo18DecimalsBN } from './shared/helpers'
import hre from 'hardhat'
const { ethers } = hre

describe('Router', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let daiContract: Contract
  let pair_DAI_WETH: Pair

  beforeEach(async () => {
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    pair_DAI_WETH = await makePair(alice, DAI, WETH)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
  })

  it('bytecode size', async () => {
    expect(((await weirollRouter.provider.getCode(weirollRouter.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('#execute', async () => {
    let planner: RouterPlanner

    beforeEach(async () => {
      planner = new RouterPlanner()
      await daiContract.transfer(weirollRouter.address, expandTo18DecimalsBN(5000))
    })

    it('returns state', async () => {
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))

      const { commands, state } = planner.plan()
      const returnVal = await weirollRouter.callStatic.execute(DEADLINE, commands, state)
      expect(returnVal).to.eql(state)
    })

    it('reverts if block.timestamp exceeds the deadline', async () => {
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      planner.add(V2ExactInputCommand(1, [DAI.address, WETH.address], alice.address))
      const invalidDeadline = 10

      const { commands, state } = planner.plan()
      await expect(weirollRouter.execute(invalidDeadline, commands, state)).to.be.revertedWith(
        'TransactionDeadlinePassed()'
      )
    })

    it('reverts for an invalid command at index 0', async () => {
      const commands = '0xffffffffffffffffffffffffffffffff'
      const state: string[] = []

      await expect(weirollRouter.execute(DEADLINE, commands, state)).to.be.revertedWith('InvalidCommandType(0)')
    })

    it('reverts for an invalid command at index 1', async () => {
      const invalidCommand = 'ffffffffffffffffffffffffffffffff'
      planner.add(TransferCommand(DAI.address, pair_DAI_WETH.liquidityToken.address, expandTo18DecimalsBN(1)))
      let { commands, state } = planner.plan()
      commands = commands.concat(invalidCommand)
      await expect(weirollRouter.execute(DEADLINE, commands, state)).to.be.revertedWith('InvalidCommandType(1)')
    })
  })
})
