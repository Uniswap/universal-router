import { CommandType, RoutePlanner } from '../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { seaportV1_4Orders, seaportInterface, getAdvancedOrderParams } from '../shared/protocolHelpers/seaport'
import { GALA, resetFork } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { Contract } from 'ethers'
import { getPermitSignature } from '../shared/protocolHelpers/permit2'
const { ethers } = hre

describe('Seaport v1.4 Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let galaContract: Contract

  describe('ETH -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16784176 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
      planner = new RoutePlanner()
    })

    it('gas: fulfillAdvancedOrder', async () => {
      const { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[0])
      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        alice.address,
      ])

      planner.addCommand(CommandType.SEAPORT_V1_4, [value.toString(), calldata])
      const { commands, inputs } = planner

      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
    })
  })

  describe('ERC20 -> NFT', () => {
    beforeEach(async () => {
      await resetFork(16784348 - 1) // 1 block before the order was created
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      alice = await ethers.getSigner(ALICE_ADDRESS)
      galaContract = new ethers.Contract(GALA.address, TOKEN_ABI, alice)

      // alice can't sign permits as we don;t have her private key. Instead bob is used
      bob = (await ethers.getSigners())[1]
      permit2 = (await deployPermit2()).connect(bob) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
      planner = new RoutePlanner()
      await galaContract.connect(bob).approve(permit2.address, ethers.constants.MaxUint256)

      // Alice seeds bob's account with GALA for tests
      await galaContract.transfer(bob.address, 100000 * 10 ** 8)
    })

    it('gas: fulfillAdvancedOrder', async () => {
      let { advancedOrder, value } = getAdvancedOrderParams(seaportV1_4Orders[2])
      value = value.div(2) // the numerator/denominator mean this is a partial fill
      const params = advancedOrder.parameters
      const considerationToken = params.consideration[0].token

      const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrder,
        [],
        OPENSEA_CONDUIT_KEY,
        bob.address,
      ])

      const permit = {
        details: {
          token: considerationToken,
          amount: value,
          expiration: 0, // expiration of 0 is block.timestamp
          nonce: 0, // this is his first trade
        },
        spender: router.address,
        sigDeadline: DEADLINE,
      }
      const sig = await getPermitSignature(permit, bob, permit2)

      planner.addCommand(CommandType.APPROVE_ERC20, [considerationToken, 0])
      planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [considerationToken, router.address, value])
      planner.addCommand(CommandType.SEAPORT_V1_4, [0, calldata])

      const { commands, inputs } = planner
      await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
    })
  })
})
