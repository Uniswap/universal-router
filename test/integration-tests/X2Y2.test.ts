import { CommandType, RoutePlanner } from './shared/planner'
import { abi as ERC721_ABI } from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import { UniversalRouter, Permit2 } from '../../typechain'
import { resetFork, ENS_721, CAMEO_1155 } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, CAMEO_ADDRESS, DEADLINE, ENS_NFT_ADDRESS } from './shared/constants'
import { parseEvents } from './shared/parseEvents'
import deployUniversalRouter, { deployPermit2 } from './shared/deployUniversalRouter'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
import { X2Y2Order, x2y2Orders, X2Y2_INTERFACE } from './shared/protocolHelpers/x2y2'
const { ethers } = hre

const ERC721_INTERFACE = new ethers.utils.Interface(ERC721_ABI)

describe('X2Y2', () => {
  let alice: SignerWithAddress
  let router: UniversalRouter
  let permit2: Permit2
  let planner: RoutePlanner

  beforeEach(async () => {
    planner = new RoutePlanner()
    alice = await ethers.getSigner(ALICE_ADDRESS)
  })

  describe('ERC-721 purchase', () => {
    let commands: string
    let inputs: string[]
    let erc721Order: X2Y2Order

    beforeEach(async () => {
      await resetFork()
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter

      erc721Order = x2y2Orders[0]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc721Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_721, [
        erc721Order.price,
        calldata,
        ALICE_ADDRESS,
        ENS_NFT_ADDRESS,
        erc721Order.token_id,
      ])
      ;({ commands, inputs } = planner)
    })

    it('purchases 1 ERC-721 on X2Y2', async () => {
      const receipt = await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc721Order.price })
      ).wait()
      const erc721TransferEvent = parseEvents(ERC721_INTERFACE, receipt)[1]?.args!

      const newOwner = await ENS_721.connect(alice).ownerOf(erc721Order.token_id)
      await expect(newOwner.toLowerCase()).to.eq(ALICE_ADDRESS)
      await expect(erc721TransferEvent.from).to.be.eq(router.address)
      await expect(erc721TransferEvent.to.toLowerCase()).to.be.eq(ALICE_ADDRESS)
      await expect(erc721TransferEvent.id).to.be.eq(erc721Order.token_id)
    })
  })

  describe('ERC-1155 purchase', () => {
    let commands: string
    let inputs: string[]
    let erc1155Order: X2Y2Order

    beforeEach(async () => {
      await resetFork(15650000)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ALICE_ADDRESS],
      })
      permit2 = (await deployPermit2()).connect(alice) as Permit2
      router = (await deployUniversalRouter(permit2)).connect(alice) as UniversalRouter

      erc1155Order = x2y2Orders[1]
      const functionSelector = X2Y2_INTERFACE.getSighash(X2Y2_INTERFACE.getFunction('run'))
      const calldata = functionSelector + erc1155Order.input.slice(2)
      planner.addCommand(CommandType.X2Y2_1155, [
        erc1155Order.price,
        calldata,
        ALICE_ADDRESS,
        CAMEO_ADDRESS,
        erc1155Order.token_id,
        1,
      ])
      ;({ commands, inputs } = planner)
    })

    it('purchases 1 ERC-1155 on X2Y2', async () => {
      await expect(await CAMEO_1155.connect(alice).balanceOf(alice.address, erc1155Order.token_id)).to.eq(0)
      await (
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: erc1155Order.price })
      ).wait()
      await expect(await CAMEO_1155.connect(alice).balanceOf(alice.address, erc1155Order.token_id)).to.eq(1)
    })
  })
})
