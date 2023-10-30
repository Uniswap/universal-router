import type { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { Permit2, CalldataOptRouter } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC } from './shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  MAX_UINT,
  MAX_UINT160,
  V2_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_FACTORY_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  ZERO_ADDRESS,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
const { ethers } = hre

describe('Uniswap V3 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: CalldataOptRouter
  let permit2: Permit2
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, bob)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, bob)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, bob)
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployCalldataOptRouter(permit2)).connect(bob) as CalldataOptRouter

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(100000))

    // Bob max-approves the permit2 contract to access his DAI and WETH and USDC
    await daiContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
  })

  describe('Trade on UniswapV3', () => {
    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(DAI.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    })

    it('completes a ETH to USDC V3 exactIn swap', async () => {
      // ETH for USDC
      // send 1 ETH, receive at least 1000 USDC
      const inputAmount = expandTo18DecimalsBN(1)
      const deadline = '0002' // 20 mins
      const minOut = '0049' // 1e9 (1000e6)
      const addresses = USDC.address.slice(2) // only usdc since it knows eth by default
      // 00 01 00 00
      const feeTiers = '10'
      const selector = '0xb5449ef3'

      const calldata = selector.concat(deadline).concat(minOut).concat(addresses).concat(feeTiers)

      const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(bob.address)
      const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)

      const transaction = {
        data: calldata,
        to: router.address,
        value: inputAmount,
        from: bob.address,
        gasPrice: BigNumber.from(2000000000000),
        gasLimit: BigNumber.from(30000000),
        type: 1,
      }

      const transactionResponse = await bob.sendTransaction(transaction)
      console.log(transactionResponse.data)

      const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(bob.address)
      const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

      console.log(ethBalanceBefore)
      console.log(ethBalanceAfter)
      console.log(usdcBalanceBefore)
      console.log(usdcBalanceAfter)
    })

    it('test WETH to USDC V3 exactIn swap', async () => {
      // WETH for USDC
      // send 1 WETH, receive at least 1000 USDC
      const deadline = '0032'
      const inputAmount = '8152' // 10000001 01010010
      const minOut = '0049' // 1e9 (1000e6)
      const addresses = WETH.address.slice(2).concat(USDC.address.slice(2))
      // 00 01 00 00
      const feeTiers = '10'
      const selector = '0xe689ddf1'

      const calldata = selector.concat(deadline).concat(inputAmount).concat(minOut).concat(addresses).concat(feeTiers)

      const wethBalanceBefore: BigNumber = await wethContract.balanceOf(bob.address)
      const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)

      const transaction = {
        data: calldata,
        to: router.address,
        value: 0,
        from: bob.address,
        gasPrice: BigNumber.from(2000000000000),
        gasLimit: BigNumber.from(30000000),
        type: 1,
      }

      const transactionResponse = await bob.sendTransaction(transaction)

      console.log(transactionResponse.data)

      const wethBalanceAfter: BigNumber = await wethContract.balanceOf(bob.address)
      const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

      console.log(wethBalanceBefore)
      console.log(wethBalanceAfter)
      console.log(usdcBalanceBefore)
      console.log(usdcBalanceAfter)
    })

    it('test no args swap', async () => {
      const inputAmount = expandTo18DecimalsBN(1)

      const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(bob.address)
      const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)

      await router.swapETHForUSDCOptimized({ value: inputAmount })

      const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(bob.address)
      const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

      console.log(ethBalanceBefore)
      console.log(ethBalanceAfter)
      console.log(usdcBalanceBefore)
      console.log(usdcBalanceAfter)
    })
  })

  async function deployCalldataOptRouter(permit2: Permit2): Promise<CalldataOptRouter> {
    const uniswapParameters = {
      v2Factory: V2_FACTORY_MAINNET,
      v3Factory: V3_FACTORY_MAINNET,
      pairInitCodeHash: V2_INIT_CODE_HASH_MAINNET,
      poolInitCodeHash: V3_INIT_CODE_HASH_MAINNET,
    }

    const paymentsParameters = {
      permit2: permit2.address,
      weth9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      steth: ZERO_ADDRESS,
      wsteth: ZERO_ADDRESS,
      openseaConduit: '0x1E0049783F008A0085193E00003D00cd54003c71',
      sudoswap: '0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329',
    }

    const routerFactory = await ethers.getContractFactory('CalldataOptRouter')
    const router = (await routerFactory.deploy(
      uniswapParameters,
      paymentsParameters,
      USDC.address
    )) as unknown as CalldataOptRouter
    return router
  }

  async function deployPermit2(): Promise<Permit2> {
    const permit2Factory = await ethers.getContractFactory('Permit2')
    const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
    return permit2
  }
})
