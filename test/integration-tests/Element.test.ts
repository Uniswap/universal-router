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
import { EXAMPLE_NFT_SELL_ORDER, EXAMPLE_NFT_SELL_ORDER_SIG } from './shared/protocolHelpers/element'
// TODO: Uncomment after getting api response
// import { element721Orders } from './shared/protocolHelpers/element'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)
const ZED_HORSE_ADDRESS = '0xA5F1Ea7DF861952863dF2e8d1312f7305dabf215'

describe.only('Element Market polygon', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let zedHorse: ERC721

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            blockNumber: 39061196,
          },
        },
      ],
    })
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    zedHorse = new ethers.Contract(ZED_HORSE_ADDRESS, ERC721_ABI).connect(alice) as ERC721
  })

  it('purchases open order', async () => {
    const value = BigNumber.from(EXAMPLE_NFT_SELL_ORDER.erc20TokenAmount) // since in example we use native token
    const calldata = ELEMENT_721_INTERFACE.encodeFunctionData('buyERC721Ex', [
      EXAMPLE_NFT_SELL_ORDER,
      EXAMPLE_NFT_SELL_ORDER_SIG,
      alice.address, // taker
      '0x00', // extraData
    ])

    planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await zedHorse.ownerOf(EXAMPLE_NFT_SELL_ORDER.nftId)
    const ethBefore = await ethers.provider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const ownerAfter = await zedHorse.ownerOf(EXAMPLE_NFT_SELL_ORDER.nftId)
    const ethAfter = await ethers.provider.getBalance(alice.address)

    expect(ownerBefore).to.eq(EXAMPLE_NFT_SELL_ORDER.maker)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethBefore.sub(ethAfter)).to.eq(value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)))
  })
})
