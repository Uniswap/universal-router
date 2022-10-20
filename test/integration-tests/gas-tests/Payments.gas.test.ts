import type { Contract } from '@ethersproject/contracts'
import { Router } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import { resetFork, DAI, WETH } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from '../shared/constants'
import { expandTo18DecimalsBN } from '../shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployRouter from '../shared/deployRouter'
import { RoutePlanner, CommandType } from '../shared/planner'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
const { ethers } = hre
import WETH_ABI from '../../../artifacts/contracts/interfaces/external/IWETH9.sol/IWETH9.json'
import { Pair } from '@uniswap/v2-sdk'
import { BigNumber } from 'ethers'

describe('Payments Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: Router
  let daiContract: Contract
  let wethContract: Contract
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, new ethers.utils.Interface(WETH_ABI.abi), alice)
    router = (await deployRouter()).connect(alice) as Router
    planner = new RoutePlanner()
  })

  describe('Individual Command Tests', () => {
    // These tests are not representative of actual situations - but allow us to monitor the cost of the commands
    // The next section contains tests for realistic situations, combined with other commands

    it('gas: TRANSFER with ERC20', async () => {
      // seed router with tokens
      const amountOfDAI: BigNumber = expandTo18DecimalsBN(3)
      await daiContract.transfer(router.address, amountOfDAI)

      planner.addCommand(CommandType.TRANSFER, [DAI.address, ALICE_ADDRESS, amountOfDAI])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: UNWRAP_WETH', async () => {
      // seed router with WETH
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await wethContract.transfer(router.address, amount)

      planner.addCommand(CommandType.UNWRAP_WETH, [alice.address, amount])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: TRANSFER with ETH', async () => {
      // seed router with WETH and unwrap it into the router
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await wethContract.transfer(router.address, amount)
      planner.addCommand(CommandType.UNWRAP_WETH, [router.address, amount])
      let commands = planner.commands
      let inputs = planner.inputs
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      // now do a transfer of those ETH as the command
      planner = new RoutePlanner()
      planner.addCommand(CommandType.TRANSFER, [ethers.constants.AddressZero, ALICE_ADDRESS, amount])
      commands = planner.commands
      inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: SWEEP with ERC20', async () => {
      // seed router with tokens
      const amountOfDAI: BigNumber = expandTo18DecimalsBN(3)
      await daiContract.transfer(router.address, amountOfDAI)

      planner.addCommand(CommandType.SWEEP, [DAI.address, ALICE_ADDRESS, amountOfDAI])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: WRAP_ETH', async () => {
      // seed router with WETH and unwrap it into the router
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await wethContract.transfer(router.address, amount)
      planner.addCommand(CommandType.UNWRAP_WETH, [router.address, amount])
      let commands = planner.commands
      let inputs = planner.inputs
      await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

      // now wrap those ETH as the command
      planner = new RoutePlanner()
      planner.addCommand(CommandType.WRAP_ETH, [ALICE_ADDRESS, amount])
      commands = planner.commands
      inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: UNWRAP_WETH_WITH_FEE', async () => {
      // seed router with WETH
      const amount: BigNumber = expandTo18DecimalsBN(3)
      await wethContract.transfer(router.address, amount)

      planner.addCommand(CommandType.UNWRAP_WETH_WITH_FEE, [alice.address, amount, 50, bob.address])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: SWEEP_WITH_FEE', async () => {
      // seed router with tokens
      const amountOfDAI: BigNumber = expandTo18DecimalsBN(3)
      await daiContract.transfer(router.address, amountOfDAI)

      planner.addCommand(CommandType.SWEEP_WITH_FEE, [DAI.address, ALICE_ADDRESS, amountOfDAI, 50, bob.address])
      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })
  })

  describe('Integration Tests', () => {
    let planner: RoutePlanner

    beforeEach(async () => {
      planner = new RoutePlanner()
      await daiContract.transfer(router.address, expandTo18DecimalsBN(5000))
    })

    it('gas: V2 exactOut swap plus sweep of remainder', async () => {
      const amountOut: BigNumber = expandTo18DecimalsBN(1)
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        amountOut,
        expandTo18DecimalsBN(1),
        [WETH.address, DAI.address],
        alice.address,
      ])
      planner.addCommand(CommandType.SWEEP, [WETH.address, alice.address, 0])
      const commands = planner.commands
      const inputs = planner.inputs

      await wethContract.transfer(router.address, expandTo18DecimalsBN(100)) // TODO: permitPost
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })

    it('gas: wraps ETH then V2 exactIn swap', async () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      const pairAddress = Pair.getAddress(DAI, WETH)

      planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [amountIn, [WETH.address, DAI.address], alice.address])

      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn.toString() })
      )
    })

    it('gas: transfer then v2 exact in swap', async () => {
      const amountIn: BigNumber = expandTo18DecimalsBN(5)
      const pairAddress = Pair.getAddress(DAI, WETH)

      planner.addCommand(CommandType.TRANSFER, [DAI.address, pairAddress, amountIn])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [1, [DAI.address, WETH.address], alice.address])

      const commands = planner.commands
      const inputs = planner.inputs

      await snapshotGasCost(
        router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: amountIn.toString() })
      )
    })
  })
})
