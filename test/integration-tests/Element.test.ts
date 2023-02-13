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
import { element721Orders } from './shared/protocolHelpers/element'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)
const ELEMENT_POLYGON_ADDRESS = "0xEAF5453b329Eb38Be159a872a6ce91c9A8fb0260"

describe.only('Element Market polygon', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner
  let zedHorse: ERC721
  let element: Contract

  const {order, signature, value} = getOrder(element721Orders[0])
  const nftContractAddress = order.nft

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 39257188,
          },
        },
      ],
    })
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })

    permit2 = (await deployPermit2()).connect(alice) as Permit2
    router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    zedHorse = new ethers.Contract(nftContractAddress, ERC721_ABI).connect(alice) as ERC721
    element = new ethers.Contract(ELEMENT_POLYGON_ADDRESS, ELEMENT_721_INTERFACE).connect(alice) as Contract
  })

  it('purchases open order', async () => {
    // get block number
    const bn = await ethers.provider.getBlockNumber()
    console.log(bn)
    const blockNumber = BigNumber.from(
      await hre.network.provider.send("eth_blockNumber")
    ).toNumber();
    console.log(blockNumber)

    console.log(order, signature)

    // should be 0x6ea39eb9ebaa33f9895454298c7df93dd582dd7159ea3616b6f9ab60eb2a0cc0
    const hash = await element.callStatic.getERC721SellOrderHash(order)
    console.log(hash)
    const hashNonce = await element.callStatic.getHashNonce(order.maker)
    console.log(hashNonce)
    const status = await element.callStatic.getERC721SellOrderStatus(order)
    console.log(status)
    expect(status).to.eq(1, 'order should be open')

    const value = BigNumber.from(order.erc20TokenAmount) // since in example we use native token
    const calldata = ELEMENT_721_INTERFACE.encodeFunctionData('buyERC721', [
      order,
      signature,
    //   alice.address, // taker
    //   '0x00', // extraData
    ])

    console.log(calldata)

    const txn = await alice.sendTransaction({
        to: ELEMENT_POLYGON_ADDRESS,
        data: calldata,
        value: value,
    })

    console.log(txn)

    return
    
    planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
    const { commands, inputs } = planner

    const ownerBefore = await zedHorse.ownerOf(order.nftId)
    const ethBefore = await remoteProvider.getBalance(alice.address)

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()

    const ownerAfter = await zedHorse.ownerOf(order.nftId)
    const ethAfter = await remoteProvider.getBalance(alice.address)

    expect(ownerBefore).to.eq(order.maker)
    expect(ownerAfter).to.eq(alice.address)
    expect(ethBefore.sub(ethAfter)).to.eq(value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)))
  })
})
