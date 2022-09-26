import { RouterPlanner, LooksRareCommand } from '@uniswap/narwhal-sdk'
import { WeirollRouter } from '../../typechain'
import LOOKS_RARE_ABI from './shared/abis/LooksRare.json'
import { resetFork, DYSTOMICE_NFT, WETH } from './shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE } from './shared/constants'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre

describe('LooksRare', () => {
  let alice: SignerWithAddress
  let weirollRouter: WeirollRouter
  let planner: RouterPlanner
  let takerOrder1016: any
  let makerOrder1016: any
  const TOKEN_ID = ethers.BigNumber.from(1016)

  const looksRareInterface = new ethers.utils.Interface(LOOKS_RARE_ABI)

  beforeEach(async () => {
    // in beforeEach not afterEach as these tests use a different block
    const looksRareBlock = 14488154
    await resetFork(looksRareBlock)

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    const weirollRouterFactory = await ethers.getContractFactory('WeirollRouter')
    weirollRouter = (await weirollRouterFactory.deploy(ethers.constants.AddressZero)).connect(alice) as WeirollRouter
    planner = new RouterPlanner()

    takerOrder1016 = {
      minPercentageToAsk: ethers.BigNumber.from(8500),
      price: ethers.BigNumber.from('50000000000000000'),
      taker: weirollRouter.address,
      tokenId: ethers.BigNumber.from(1016),
      isOrderAsk: false,
      params: '0x',
    }

    makerOrder1016 = {
      amount: ethers.BigNumber.from(1),
      collection: DYSTOMICE_NFT.address,
      currency: WETH.address,
      endTime: ethers.BigNumber.from('1651243016'),
      isOrderAsk: true,
      minPercentageToAsk: ethers.BigNumber.from(8500),
      nonce: ethers.BigNumber.from(10),
      price: ethers.BigNumber.from('50000000000000000'),
      r: '0x69ffd53834c4f27378fb62e6782fb74cb8b48d1a556030b7b99d9e670f9e79a1',
      s: '0x3e2df8c6d30dcc177741bd9501d9f160caa647a92415a053dd31977169aabf72',
      signer: '0xaac27a7e079ea4949d558fd1748956eb1b86f70b',
      startTime: ethers.BigNumber.from('1648651040'),
      strategy: '0x56244bb70cbd3ea9dc8007399f61dfc065190031',
      tokenId: ethers.BigNumber.from(1016),
      v: ethers.BigNumber.from(28),
      params: '0x',
    }
  })

  it('Buy a DystoMice', async () => {
    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder1016,
      makerOrder1016,
    ])
    const value = ethers.utils.parseEther('0.05')

    planner.add(LooksRareCommand(value.toString(), calldata, ALICE_ADDRESS, DYSTOMICE_NFT.address, TOKEN_ID))
    const { commands, state } = planner.plan()
    await weirollRouter.execute(DEADLINE, commands, state, { value: value })

    await expect((await DYSTOMICE_NFT.ownerOf(TOKEN_ID)).toLowerCase()).to.eq(ALICE_ADDRESS)
  })
})
