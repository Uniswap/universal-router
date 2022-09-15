import { Interface, LogDescription } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import type { Contract } from '@ethersproject/contracts'
import {
  RouterPlanner,
  SeaportCommand,
  SweepCommand,
  TransferCommand,
  V2ExactInputCommand,
  V2ExactOutputCommand,
  V3ExactInputCommand,
  UnwrapWETHCommand,
  WrapETHCommand,
} from '@uniswap/narwhal-sdk'
import { CurrencyAmount, Ether, Percent, Token } from '@uniswap/sdk-core'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { WeirollRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import SEAPORT_ABI from './shared/abis/Seaport.json'
import { executeSwap, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, OPENSEA_DEFAULT_ZONE, OPENSEA_CONDUIT, OPENSEA_CONDUIT_KEY} from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre
import fs from 'fs'

const seaportOrders = JSON.parse(fs.readFileSync('test/integration-tests/shared/orders/Seaport.json', { encoding: 'utf8' }))
const seaportInterface = new ethers.utils.Interface(SEAPORT_ABI);


// type BasicOrderParameters = {
//     considerationToken: string // address
//     considerationIdentifier: uint256
//     considerationAmount: uint256
//     offerer: string // address payable
//     zone: string // address
//     offerToken: string // address
//     offerIdentifier: uint256
//     offerAmount: uint256
//     basicOrderType: BasicOrderType
//     startTime: uint256
//     endTime: uint256
//     zoneHash: bytes32
//     salt: uint256
//     offererConduitKey: bytes32
//     fulfillerConduitKey: bytes32
//     totalOriginalAdditionalRecipients: uint256
//     additionalRecipients: AdditionalRecipient[]
//     signature: bytes
// }

async function resetFork() {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          blockNumber: 15360000,
        },
      },
    ],
  })
}

type OfferItem = {
   itemType: BigNumber, // enum
   token: string, // address
   identifierOrCriteria: BigNumber,
   startAmount: BigNumber,
   endAmount: BigNumber,
}

type ConsiderationItem = OfferItem & {
  recipient: string
}

type OrderParameters =  {
     offerer: string // address,
     offer: OfferItem[],
     consideration: ConsiderationItem[],
     orderType: BigNumber, // enum
     startTime: BigNumber,
     endTime: BigNumber,
     zoneHash: string, // bytes32
     salt: BigNumber,
     conduitKey: string, // bytes32,
     totalOriginalConsiderationItems: BigNumber,
}

type Order =  {
  parameters: OrderParameters,
  signature: string
}

function getOrderParams(apiOrder: any): Order {
  delete apiOrder.protocol_data.parameters.counter
  return {
    parameters: apiOrder.protocol_data.parameters,
    signature: apiOrder.protocol_data.signature
  }
}

describe.only('Seaport', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RouterPlanner

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, alice)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, alice)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)
    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
    planner = new RouterPlanner()
  })

  it('completes a fulfillBasicOrder type', async () => {
    const orderParams: Order = getOrderParams(seaportOrders[0])
    const calldata = seaportInterface.encodeFunctionData("fulfillOrder", [orderParams, OPENSEA_CONDUIT_KEY])
    planner.add(SeaportCommand(BigNumber.from((3 * 10 ** 18).toString()), calldata))

    const { commands, state } = planner.plan()
    const tx = await weirollRouter.execute(commands, state, {value: BigNumber.from((3 * 10 ** 18).toString())})
    const receipt = await tx.wait()
  })
})
