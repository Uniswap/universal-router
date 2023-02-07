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
import { ERC721Order, getOrderTypedData, SignedOrder } from './shared/protocolHelpers/element'
// TODO: Uncomment after getting api response
// import { element721Orders } from './shared/protocolHelpers/element'

const { ethers } = hre

const ELEMENT_721_INTERFACE = new ethers.utils.Interface(ELEMENT_ABI)

describe('Element Market', () => {
    let alice: SignerWithAddress
    let router: UniversalRouter
    let permit2: Permit2
    let planner: RoutePlanner
  
    beforeEach(async () => {
      planner = new RoutePlanner()
      alice = await ethers.getSigner(ALICE_ADDRESS)
      await resetFork(15740629)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter
    })

    it('purchases open order', async () => {
        const { order, signature, value } = getOrder(element721Orders[0])
        const calldata = ELEMENT_721_INTERFACE.encodeFunctionData('buyERC721Ex', [
            order,
            signature,
            alice.address, // taker
            '0x00' // extraData
        ])

        planner.addCommand(CommandType.ELEMENT_MARKET, [value.toString(), calldata])
        const { commands, inputs } = planner
        const ethBefore = await ethers.provider.getBalance(alice.address)
        const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
        const ethAfter = await ethers.provider.getBalance(alice.address)
    })
})

