import { CommandType, RoutePlanner } from './shared/planner'
import ELEMENT_ABI from './shared/abis/Element.json'
import { ERC721, UniversalRouter, Permit2 } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { expect } from 'chai'
import { EXAMPLE_ETH_SELL_ORDER, EXAMPLE_ETH_SELL_ORDER_SIG } from './shared/protocolHelpers/element'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)

describe('Element Market', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let testNFTContract: ERC721

  const order = EXAMPLE_ETH_SELL_ORDER
  const signature = EXAMPLE_ETH_SELL_ORDER_SIG
  const nftContractAddress = order.nft

  beforeEach(async () => {
    // txn is at block 16627214
    await resetFork(16627214 - 1)
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
      '0x', // extraData
    ])

    planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await testNFTContract.ownerOf(order.nftId)

    await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).to.changeEtherBalance(
      alice,
      value.mul(-1)
    )

    const ownerAfter = await testNFTContract.ownerOf(order.nftId)
    expect(ownerBefore).to.eq(order.maker)
    expect(ownerAfter).to.eq(order.taker)
  })
})
