import { CommandType, RoutePlanner } from './shared/planner'
import ELEMENT_ABI from './shared/abis/Element.json'
import { ERC721, UniversalRouter, Permit2 } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber, Contract } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { expect } from 'chai'
import { getOrder } from './shared/protocolHelpers/element'
// TODO: Uncomment after getting api response
import { element721Orders, EXAMPLE_ETH_SELL_ORDER, EXAMPLE_ETH_SELL_ORDER_SIG } from './shared/protocolHelpers/element'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)

describe.only('Element Market', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let testNFTContract: ERC721

  /// @dev re-enable this once figure out fee encoding
  // const {order, signature, value} = getOrder(element721Orders[0])
  const order = EXAMPLE_ETH_SELL_ORDER
  const signature = EXAMPLE_ETH_SELL_ORDER_SIG
  const nftContractAddress = order.nft

  beforeEach(async () => {
    await resetFork(16627214 - 1) // fork at the block right before the txn
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    testNFTContract = new ethers.Contract(nftContractAddress, ERC721_ABI).connect(alice) as ERC721
  })

  it('purchases open order', async () => {
    const value = BigNumber.from(order.erc20TokenAmount)
    const calldata = ELEMENT_721_INTERFACE.encodeFunctionData('buyERC721Ex', [
      order,
      signature,
      order.taker, // taker
      '0x00', // extraData
    ])

    planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await testNFTContract.ownerOf(order.nftId)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const ownerAfter = await testNFTContract.ownerOf(order.nftId)
    const ethAfter = await ethers.provider.getBalance(alice.address)

    expect(ownerBefore).to.eq(order.maker)
    expect(ownerAfter).to.eq(order.taker)
    expect(ethBefore.sub(ethAfter)).to.eq(value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)))
  })
})
