import { CommandType, RoutePlanner } from '../shared/planner'
import { UniversalRouter, Permit2 } from '../../../typechain'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { seaportOrders, seaportInterface, getAdvancedOrderParams } from '../shared/protocolHelpers/seaport'
import { resetFork, WETH } from '../shared/mainnetForkHelpers'
import { DEADLINE, MAX_UINT, OPENSEA_CONDUIT, OPENSEA_CONDUIT_KEY } from '../shared/constants'
import { abi as ERC20_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import deployUniversalRouter, { deployPermit2 } from '../shared/deployUniversalRouter'
import { Contract } from 'ethers'
import { getPermitSignature } from '../shared/protocolHelpers/permit2'
const { ethers } = hre

describe('Seaport Gas Tests', () => {
  let bob: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let weth: Contract

  beforeEach(async () => {
    await resetFork(16635782)
    // bob's permits fail w/ account not found so using bob from default signers
    bob = (await ethers.getSigners())[1]    
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(bob) as UniversalRouter
    planner = new RoutePlanner()
    weth = new ethers.Contract(WETH.address, ERC20_ABI, bob)
    const routerSigner = await ethers.getImpersonatedSigner(router.address)

    // bob deposits 10 eth into weth
    await bob.sendTransaction({ to: weth.address, value: ethers.utils.parseEther('10') })
    // approve permit2 for all for bob's weth
    await weth.connect(bob).approve(permit2.address, ethers.constants.MaxUint256)
    // custom approve the conduit key for router
    await weth.connect(routerSigner).approve(OPENSEA_CONDUIT, MAX_UINT)
  })

  it('gas: fulfillAdvancedOrder', async () => {
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      bob.address,
    ])

    planner.addCommand(CommandType.SEAPORT, [value.toString(), calldata])
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: fufillAdvancedOrder with ERC20', async () => {
    // seaportOrders[2] is an order containing ERC20 (WETH) as consideration
    const { advancedOrder, value } = getAdvancedOrderParams(seaportOrders[2])
    const params = advancedOrder.parameters
    const calldata = seaportInterface.encodeFunctionData('fulfillAdvancedOrder', [
      advancedOrder,
      [],
      OPENSEA_CONDUIT_KEY,
      bob.address,
    ])
    const considerationToken = params.consideration[0].token
    const permit = {
      details: {
        token: weth.address,
        amount: value,
        expiration: 0,
        nonce: 0,
      },
      spender: router.address,
      sigDeadline: DEADLINE,
    }
    const sig = await getPermitSignature(permit, bob, permit2)

    planner.addCommand(CommandType.APPROVE_ERC20, [considerationToken, 0])
    planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
    planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [weth.address, router.address, value])
    planner.addCommand(CommandType.SEAPORT, [0, calldata])
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })

  it('gas: fulfillAvailableAdvancedOrders 1 orders', async () => {
    const { advancedOrder: advancedOrder0, value: value1 } = getAdvancedOrderParams(seaportOrders[0])
    const { advancedOrder: advancedOrder1, value: value2 } = getAdvancedOrderParams(seaportOrders[1])
    const value = value1.add(value2)
    const considerationFulfillment = [
      [[0, 0]],
      [
        [0, 1],
        [1, 1],
      ],
      [
        [0, 2],
        [1, 2],
      ],
      [[1, 0]],
    ]

    const calldata = seaportInterface.encodeFunctionData('fulfillAvailableAdvancedOrders', [
      [advancedOrder0, advancedOrder1],
      [],
      [[[0, 0]], [[1, 0]]],
      considerationFulfillment,
      OPENSEA_CONDUIT_KEY,
      bob.address,
      100,
    ])

    planner.addCommand(CommandType.SEAPORT, [value, calldata])
    const { commands, inputs } = planner

    await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value }))
  })
})
