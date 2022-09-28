import { RouterPlanner, LooksRareCommand } from '@uniswap/narwhal-sdk'
import { Router, ERC721 } from '../../typechain'
import LOOKS_RARE_ABI from './shared/abis/LooksRare.json'
import { resetFork, WETH, COVEN_NFT } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  COVEN_ADDRESS,
  DEADLINE,
  V2_FACTORY_MAINNET,
  V3_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { expect } from 'chai'
const { ethers } = hre

describe.only('LooksRare', () => {
  let alice: SignerWithAddress
  let router: Router
  let planner: RouterPlanner
  let covenContract: ERC721
  let takerOrder4331: any
  let makerOrder4331: any
  const TOKEN_ID = ethers.BigNumber.from(4331)

  const looksRareInterface = new ethers.utils.Interface(LOOKS_RARE_ABI)

  beforeEach(async () => {
    // in beforeEach not afterEach as these tests use a different block
    await resetFork()
    covenContract = COVEN_NFT.connect(alice)

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)

    const routerFactory = await ethers.getContractFactory('Router')
    router = (
      await routerFactory.deploy(
        ethers.constants.AddressZero,
        V2_FACTORY_MAINNET,
        V3_FACTORY_MAINNET,
        V2_INIT_CODE_HASH_MAINNET,
        V3_INIT_CODE_HASH_MAINNET
      )
    ).connect(alice) as Router
    planner = new RouterPlanner()

    takerOrder4331 = {
      minPercentageToAsk: ethers.BigNumber.from(8500),
      price: ethers.BigNumber.from('32000000000000000000'),
      taker: router.address,
      tokenId: ethers.BigNumber.from(4331),
      isOrderAsk: false,
      params: '0x',
    }

    makerOrder4331 = {
      amount: ethers.BigNumber.from(1),
      collection: '0x5180db8F5c931aaE63c74266b211F580155ecac8',
      currency: WETH.address,
      isOrderAsk: true,
      minPercentageToAsk: ethers.BigNumber.from(8500),
      nonce: ethers.BigNumber.from(45),
      price: ethers.BigNumber.from('32000000000000000000'),
      r: '0x2d89300623b02e6305d770925d6a34006de07723fd0910a0b1f7780c6964a41b',
      s: '0x1430768f23a5ad85c14de1a97fcc428fd001944dfcb659fd73f3f70e653e4507',
      signer: '0x22E86ab483084053562cE713e94431C29D1Adb8b',
      startTime: ethers.BigNumber.from('1650697012'),
      endTime: ethers.BigNumber.from('1666245407'),
      strategy: '0x56244Bb70CbD3EA9Dc8007399F61dFC065190031',
      tokenId: ethers.BigNumber.from(4331),
      v: ethers.BigNumber.from(27),
      params: '0x',
    }
  })

  it('Buy a Coven', async () => {
    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder4331,
      makerOrder4331,
    ])
    const value = ethers.utils.parseEther('32')

    planner.add(LooksRareCommand(value.toString(), calldata, ALICE_ADDRESS, COVEN_ADDRESS, 4331))
    const { commands, state } = planner.plan()
    await router.execute(DEADLINE, commands, state, { value: value })

    await expect((await covenContract.connect(alice).ownerOf(TOKEN_ID)).toLowerCase()).to.eq(ALICE_ADDRESS)
  })

  it('gas: buy 1 NFT on looks rare', async () => {
    const calldata = looksRareInterface.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
      takerOrder4331,
      makerOrder4331,
    ])
    const value = ethers.utils.parseEther('32')

    planner.add(LooksRareCommand(value.toString(), calldata, ALICE_ADDRESS, COVEN_ADDRESS, TOKEN_ID))
    const { commands, state } = planner.plan()

    await snapshotGasCost(router.execute(DEADLINE, commands, state, { value }))
  })
})
