import type { Contract } from '@ethersproject/contracts'
import { expect } from './shared/expect'
import { BigNumber } from 'ethers'
import { UniversalRouter, INonfungiblePositionManager, PositionManager } from '../../typechain'
import { abi as TOKEN_ABI } from '../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, V3_NFT_POSITION_MANAGER } from './shared/mainnetForkHelpers'
import { abi as POOL_MANAGER_ABI } from '../../artifacts/@uniswap/v4-core/src/PoolManager.sol/PoolManager.json'
import {
  ZERO_ADDRESS,
  ALICE_ADDRESS,
  MAX_UINT,
  MAX_UINT128,
  OPEN_DELTA,
  SOURCE_ROUTER,
  CONTRACT_BALANCE,
} from './shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployUniversalRouter from './shared/deployUniversalRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import { V4Planner, Actions } from './shared/v4Planner'
import hre from 'hardhat'
import getPermitNFTSignature from './shared/getPermitNFTSignature'
import getPermitV4Signature from './shared/getPermitV4Signature'
import { ADDRESS_ZERO, FeeAmount } from '@uniswap/v3-sdk'
import {
  encodeERC721Permit,
  encodeDecreaseLiquidity,
  encodeCollect,
  encodeBurn,
  encodeModifyLiquidities,
  encodeERC721PermitV4,
} from './shared/encodeCall'
import { executeRouter } from './shared/executeRouter'
import { USDC_WETH, ETH_USDC } from './shared/v4Helpers'
import { parseEvents } from './shared/parseEvents'
const { ethers } = hre

const poolManagerInterface = new ethers.utils.Interface(POOL_MANAGER_ABI)

describe('V3 to V4 Migration Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let eve: SignerWithAddress
  let router: UniversalRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner
  let v4Planner: V4Planner
  let v3NFTPositionManager: INonfungiblePositionManager
  let v4PositionManagerAddress: string
  let v4PositionManager: PositionManager

  let tokenIdv3: BigNumber

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]
    eve = (await ethers.getSigners())[2]
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, bob)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, bob)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, bob)
    v3NFTPositionManager = V3_NFT_POSITION_MANAGER.connect(bob) as INonfungiblePositionManager
    router = (await deployUniversalRouter(bob.address)) as UniversalRouter
    v4PositionManagerAddress = await router.V4_POSITION_MANAGER()
    v4PositionManager = (await ethers.getContractAt('PositionManager', v4PositionManagerAddress)) as PositionManager

    planner = new RoutePlanner()
    v4Planner = new V4Planner()

    // alice gives bob some tokens
    await daiContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(100000))
  })

  describe('V3 Commands', () => {
    beforeEach(async () => {
      // Bob max-approves the v3PM to access his USDC and WETH
      await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
      await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

      let bobUSDCBalanceBefore = await usdcContract.balanceOf(bob.address)
      let bobWETHBalanceBefore = await wethContract.balanceOf(bob.address)

      // need to mint the nft to bob
      const tx = await v3NFTPositionManager.mint({
        token0: USDC.address,
        token1: WETH.address,
        fee: FeeAmount.LOW,
        tickLower: 0,
        tickUpper: 194980,
        amount0Desired: expandTo6DecimalsBN(2500),
        amount1Desired: expandTo18DecimalsBN(1),
        amount0Min: 0,
        amount1Min: 0,
        recipient: bob.address,
        deadline: MAX_UINT,
      })

      let bobUSDCBalanceAfter = await usdcContract.balanceOf(bob.address)
      let bobWETHBalanceAfter = await wethContract.balanceOf(bob.address)

      let usdcSpent = bobUSDCBalanceBefore.sub(bobUSDCBalanceAfter)
      let wethSpent = bobWETHBalanceBefore.sub(bobWETHBalanceAfter)

      // check that the USDC and WETH were spent
      expect(usdcSpent > 0 || wethSpent > 0)
      const receipt = await tx.wait()

      const transferEvent = receipt.events?.find((event) => event.event === 'IncreaseLiquidity')

      tokenIdv3 = transferEvent?.args?.tokenId
    })

    describe('erc721permit', () => {
      it('erc721 permit succeeds', async () => {
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)

        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        expect((await v3NFTPositionManager.positions(tokenIdv3)).operator).to.eq(ZERO_ADDRESS)

        // bob permits the router to spend token
        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        expect((await v3NFTPositionManager.positions(tokenIdv3)).operator).to.eq(router.address)
      })

      it('need to call permit when executing V3_POSITION_MANAGER_PERMIT command', async () => {
        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedDecreaseCall])

        // trying to execute the permit commmand by calling decrease liquidity
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'InvalidAction')
      })

      it('only owner of the token can generate a signature to permit another address', async () => {
        // eve is not the owner of the token
        const { v, r, s } = await getPermitNFTSignature(eve, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        // eve generated a signature for bob's token - fails since eve is not the owner
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'ExecutionFailed')
      })

      it('other address can call permit on behalf of someone as long as owner of the token generated the signature properly', async () => {
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        expect((await v3NFTPositionManager.positions(tokenIdv3)).operator).to.eq(ZERO_ADDRESS)

        // eve can permit the router for bob using bob's signature
        await executeRouter(planner, eve, router, wethContract, daiContract, usdcContract)

        expect((await v3NFTPositionManager.positions(tokenIdv3)).operator).to.eq(router.address)
      })
    })

    describe('decrease liquidity', () => {
      it('decrease liquidity succeeds', async () => {
        // first we need to permit the router to spend the nft
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity
        expect(liquidity).to.be.gt(0)
        let owed0Before = position.tokensOwed0
        let owed1Before = position.tokensOwed1

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        position = await v3NFTPositionManager.positions(tokenIdv3)
        liquidity = position.liquidity
        let owed0After = position.tokensOwed0
        let owed1After = position.tokensOwed1

        expect(liquidity).to.eq(0)
        expect(owed0After).to.be.gt(owed0Before)
        expect(owed1After).to.be.gt(owed1Before)
      })

      it('cannot decrease liquidity without permiting the router', async () => {
        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'ExecutionFailed')
      })

      it('cannot call decrease liquidity with improper function selector', async () => {
        // first we need to permit the router to spend the nft
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const BAD_DECREASE_LIQUIDITY_STRUCT =
          '(uint256 tokenId,uint256 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)'

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const abi = new ethers.utils.AbiCoder()
        const encodedParams = abi.encode([BAD_DECREASE_LIQUIDITY_STRUCT], [decreaseParams])
        const functionSignature = ethers.utils
          .id('decreaseLiquidity((uint256,uint128,uint256,uint256))')
          .substring(0, 10)
        const encodedCall = functionSignature + encodedParams.substring(2)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCall])
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'InvalidAction')
      })

      it('fails if decrease liquidity call fails', async () => {
        // first we need to permit the router to spend the nft
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        // set the deadline to 0
        const decreaseParams = { tokenId: tokenIdv3, liquidity: liquidity, amount0Min: 0, amount1Min: 0, deadline: '0' }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        // call to decrease liquidity fails since the deadline is set to 0
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'ExecutionFailed')
      })

      it('cannot call decrease liquidity if not authorized', async () => {
        // bob creates a signature for the router to spend the token
        const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        planner = new RoutePlanner()

        // transfer the token to eve
        await v3NFTPositionManager.transferFrom(bob.address, eve.address, tokenIdv3)

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        // bob is trying to use the token that is now owned by eve. he is not authorized to do so
        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'NotAuthorizedForToken')
      })

      it('eve permits bob for all tokens - he can call decrease even though he is not the owner', async () => {
        // transfer the token to eve
        await v3NFTPositionManager.transferFrom(bob.address, eve.address, tokenIdv3)

        // eve permits bob to spend all of her tokens
        await v3NFTPositionManager.connect(eve).setApprovalForAll(bob.address, true)

        // eve creates a signature for the router to spend the token
        let { v, r, s } = await getPermitNFTSignature(eve, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const params = { tokenId: tokenIdv3, liquidity: liquidity, amount0Min: 0, amount1Min: 0, deadline: MAX_UINT }

        const encodedDecreaseCall = encodeDecreaseLiquidity(params)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      })

      it('eve permits bob for the token and approves router for all her tokens - he can call decrease even though he is not the owner', async () => {
        // transfer the token to eve
        await v3NFTPositionManager.transferFrom(bob.address, eve.address, tokenIdv3)

        // eve approves the router to spend all of her tokens
        await v3NFTPositionManager.connect(eve).setApprovalForAll(router.address, true)

        // eve creates a signature for bob to spend the token
        let { v, r, s } = await getPermitNFTSignature(eve, v3NFTPositionManager, bob.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: bob.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const params = { tokenId: tokenIdv3, liquidity: liquidity, amount0Min: 0, amount1Min: 0, deadline: MAX_UINT }

        const encodedDecreaseCall = encodeDecreaseLiquidity(params)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      })
    })

    describe('collect liquidity', () => {
      it('collect succeeds', async () => {
        let bobToken0BalanceBefore = await usdcContract.balanceOf(bob.address)
        let bobToken1BalanceBefore = await wethContract.balanceOf(bob.address)

        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const collectParams = {
          tokenId: tokenIdv3,
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        position = await v3NFTPositionManager.positions(tokenIdv3)
        let owed0 = position.tokensOwed0
        let owed1 = position.tokensOwed1

        expect(owed0).to.eq(0)
        expect(owed1).to.eq(0)

        let bobToken0BalanceAfter = await usdcContract.balanceOf(bob.address)
        let bobToken1BalanceAfter = await wethContract.balanceOf(bob.address)

        // bob is the recipient - he should have received the owed tokens
        expect(bobToken0BalanceAfter).to.be.gt(bobToken0BalanceBefore)
        expect(bobToken1BalanceAfter).to.be.gt(bobToken1BalanceBefore)
      })

      it('collecting the correct amount', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        let bobToken0BalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)
        let bobToken1BalanceBefore: BigNumber = await wethContract.balanceOf(bob.address)

        position = await v3NFTPositionManager.positions(tokenIdv3)
        let owed0Before = position.tokensOwed0
        let owed1Before = position.tokensOwed1
        let liquidityBefore = position.liquidity

        expect(liquidityBefore).to.be.eq(0)

        planner = new RoutePlanner()

        const collectParams = {
          tokenId: tokenIdv3,
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        await v3NFTPositionManager.setApprovalForAll(eve.address, true)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await executeRouter(planner, eve, router, wethContract, daiContract, usdcContract)

        position = await v3NFTPositionManager.positions(tokenIdv3)
        let owed0After = position.tokensOwed0
        let owed1After = position.tokensOwed1

        expect(owed0After).to.eq(0)
        expect(owed1After).to.eq(0)

        let bobToken0BalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)
        let bobToken1BalanceAfter: BigNumber = await wethContract.balanceOf(bob.address)

        // bob is the recipient - he should have received the owed tokens
        expect(bobToken0BalanceAfter.sub(bobToken0BalanceBefore)).to.be.eq(owed0Before)
        expect(bobToken1BalanceAfter.sub(bobToken1BalanceBefore)).to.be.eq(owed1Before)
      })

      it('collect succeeds with router as recipient', async () => {
        let routerToken0BalanceBefore = await usdcContract.balanceOf(router.address)
        let routerToken1BalanceBefore = await wethContract.balanceOf(router.address)

        // router should have no balance of the tokens
        expect(routerToken0BalanceBefore).to.be.eq(0)
        expect(routerToken1BalanceBefore).to.be.eq(0)

        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const collectParams = {
          tokenId: tokenIdv3,
          recipient: router.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        let routerToken0BalanceAfter = await usdcContract.balanceOf(router.address)
        let routerToken1BalanceAfter = await wethContract.balanceOf(router.address)

        // router is the recipient - router should have received the owed tokens
        // (there is sweep function if necessary)
        expect(routerToken0BalanceAfter).to.be.gt(routerToken0BalanceBefore)
        expect(routerToken1BalanceAfter).to.be.gt(routerToken1BalanceBefore)
      })

      it('cannot call collect with improper signature', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max,uint256 amount1Max)'
        const collectParams = {
          tokenId: tokenIdv3,
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const abi = new ethers.utils.AbiCoder()
        const encodedCollectParams = abi.encode([COLLECT_STRUCT], [collectParams])
        const functionSignatureCollect = ethers.utils.id('collect((uint256,address,uint128))').substring(0, 10)
        const encodedCollectCall = functionSignatureCollect + encodedCollectParams.substring(2)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'InvalidAction')
      })

      it('cannot call collect with improper params', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const COLLECT_STRUCT = '(uint256 tokenId,address recipient,uint256 amount0Max)'
        const collectParams = { tokenId: tokenIdv3, recipient: bob.address, amount0Max: MAX_UINT128 }

        const abi = new ethers.utils.AbiCoder()
        const encodedCollectParams = abi.encode([COLLECT_STRUCT], [collectParams])
        const functionSignatureCollect = ethers.utils.id('collect((uint256,address,uint128,uint128))').substring(0, 10)
        const encodedCollectCall = functionSignatureCollect + encodedCollectParams.substring(2)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'ExecutionFailed')
      })

      it('cannot call collect if the router is not approved for that tokenid', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        planner = new RoutePlanner()

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        // approved on the decrease call
        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        // not approved on the collect call
        const collectParams = {
          tokenId: BigNumber.from(1),
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        await expect(
          executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'NotAuthorizedForToken')
      })

      it('address cannot call collect if unapproved for that tokenid', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        planner = new RoutePlanner()

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        // approved on the decrease call
        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
        const collectParams = {
          tokenId: tokenIdv3,
          recipient: eve.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)
        planner = new RoutePlanner()
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        // not approved on the collect call
        await expect(
          executeRouter(planner, eve, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'NotAuthorizedForToken')
      })
    })

    describe('burn liquidity', () => {
      it('burn succeeds', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const collectParams = {
          tokenId: tokenIdv3,
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        const encodedBurnCall = encodeBurn(tokenIdv3)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(0)
      })

      it('burn fails if you arent approved spender of nft', async () => {
        // first we need to permit the router to spend the nft
        let { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)
        const erc721PermitParams = {
          spender: router.address,
          tokenId: tokenIdv3,
          deadline: MAX_UINT,
          v: v,
          r: r,
          s: s,
        }

        const encodedErc721PermitCall = encodeERC721Permit(erc721PermitParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])

        let position = await v3NFTPositionManager.positions(tokenIdv3)
        let liquidity = position.liquidity

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        const collectParams = {
          tokenId: tokenIdv3,
          recipient: bob.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])

        // bob decreases and collects the liquidity
        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        planner = new RoutePlanner()

        const encodedBurnCall = encodeBurn(tokenIdv3)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

        // eve tries to burn the token - she is not approved to do so
        await expect(
          executeRouter(planner, eve, router, wethContract, daiContract, usdcContract)
        ).to.be.revertedWithCustomError(router, 'NotAuthorizedForToken')
      })
    })
  })

  describe('V4 Commands', () => {
    beforeEach(async () => {
      // initialize new pool on v4
      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [USDC_WETH.poolKey, USDC_WETH.price])
      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      planner = new RoutePlanner()
    })

    it('initializes a pool', async () => {
      const poolKey = {
        currency0: USDC.address,
        currency1: WETH.address,
        fee: FeeAmount.HIGH, // to make it different to USDC_WETH.poolKey
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
      }

      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [poolKey, USDC_WETH.price])
      let tx = await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // check that an initialize event was emitted on the pool manager
      let receipt = tx.receipt
      let txEvents = parseEvents(poolManagerInterface, receipt)

      const { name } = txEvents[0]!
      expect(name).to.eq('Initialize')

      const { currency0, currency1, sqrtPriceX96 } = txEvents[0]!.args
      expect(currency0).to.eq(USDC_WETH.poolKey.currency0)
      expect(currency1).to.eq(USDC_WETH.poolKey.currency1)
      expect(sqrtPriceX96).to.eq(USDC_WETH.price)
    })

    it('mint v4 succeeds', async () => {
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      const calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      // assert that the posm holds tokens before executeRouter
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(expandTo6DecimalsBN(100000))
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(expandTo18DecimalsBN(100))

      // bob does not own a position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(0)

      let expectedTokenId = await v4PositionManager.nextTokenId()
      let bobUSDCBalanceBefore = await usdcContract.balanceOf(bob.address)
      let bobWETHBalanceBefore = await wethContract.balanceOf(bob.address)

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // bob successfully sweeped his usdc and weth from the v4 position manager
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(0)
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(0)
      expect(await usdcContract.balanceOf(bob.address)).to.be.gt(bobUSDCBalanceBefore)
      expect(await wethContract.balanceOf(bob.address)).to.be.gt(bobWETHBalanceBefore)

      // bob owns a position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)
      expect(await v4PositionManager.ownerOf(expectedTokenId)).to.eq(bob.address)
    })

    it('an address can mint on behalf of another address', async () => {
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      // mint params for bob
      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      const calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      // bob does not own a position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(0)
      // alice does not own a position
      expect(await v4PositionManager.balanceOf(alice.address)).to.eq(0)

      let expectedTokenId = await v4PositionManager.nextTokenId()

      // alice mints a position for bob
      await executeRouter(planner, alice, router, wethContract, daiContract, usdcContract)

      // bob owns a position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)
      // alice does not own a position
      expect(await v4PositionManager.balanceOf(alice.address)).to.eq(0)

      expect(await v4PositionManager.ownerOf(expectedTokenId)).to.eq(bob.address)
    })

    it('erc721 permit on v4 fails with invalid selector', async () => {
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      // mint position first
      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      // router is not approved to spend the token
      expect(await v4PositionManager.getApproved(expectedTokenId)).to.eq(ZERO_ADDRESS)

      const { compact } = await getPermitV4Signature(
        bob,
        v4PositionManager,
        router.address,
        expectedTokenId,
        MAX_UINT,
        { nonce: 1 }
      )

      const erc721PermitParams = {
        spender: router.address,
        tokenId: expectedTokenId,
        deadline: MAX_UINT,
        nonce: 1,
        signature: compact,
      }

      const encodedErc721PermitCall = encodeERC721PermitV4(erc721PermitParams)

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedErc721PermitCall])

      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(router, 'InvalidAction')
    })

    it('increase v4 fails', async () => {
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))
      // mint position first
      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      // bob owns a position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)

      // increase position second
      planner = new RoutePlanner()
      v4Planner = new V4Planner()
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(10000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(10))

      v4Planner.addAction(Actions.INCREASE_LIQUIDITY, [expectedTokenId, '6000000', MAX_UINT128, MAX_UINT128, '0x'])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      // assert that the posm holds tokens before executeRouter
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(expandTo6DecimalsBN(10000))
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(expandTo18DecimalsBN(10))

      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(router, 'OnlyMintAllowed')
    })

    it('decrease v4 does not succeed', async () => {
      // first mint the v4 nft
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // try to decrease the position second
      planner = new RoutePlanner()
      v4Planner = new V4Planner()

      v4Planner.addAction(Actions.DECREASE_LIQUIDITY, [expectedTokenId, '6000000', 0, 0, '0x'])

      v4Planner.addAction(Actions.CLOSE_CURRENCY, [USDC.address])
      v4Planner.addAction(Actions.CLOSE_CURRENCY, [WETH.address])

      calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(router, 'OnlyMintAllowed')
    })

    it('burn v4 does not succeed', async () => {
      // first mint the v4 nft
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // try to decrease the position second
      planner = new RoutePlanner()
      v4Planner = new V4Planner()

      v4Planner.addAction(Actions.BURN_POSITION, [expectedTokenId, 0, 0, '0x'])

      v4Planner.addAction(Actions.CLOSE_CURRENCY, [USDC.address])
      v4Planner.addAction(Actions.CLOSE_CURRENCY, [WETH.address])

      calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(router, 'OnlyMintAllowed')
    })
  })

  describe('Migration', () => {
    it('migrate with initialize pool and minting succeeds', async () => {
      // Bob max-approves the v3PM to access his USDC and WETH
      await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
      await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [USDC_WETH.poolKey, USDC_WETH.price])

      // mint the nft to bob on v3
      const tx = await v3NFTPositionManager.mint({
        token0: USDC.address,
        token1: WETH.address,
        fee: FeeAmount.LOW,
        tickLower: 0,
        tickUpper: 194980,
        amount0Desired: expandTo6DecimalsBN(2500),
        amount1Desired: expandTo18DecimalsBN(1),
        amount0Min: 0,
        amount1Min: 0,
        recipient: bob.address,
        deadline: MAX_UINT,
      })

      // bob owns a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(1)

      // bob does not own a v4position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(0)

      const receipt = await tx.wait()
      const transferEvent = receipt.events?.find((event) => event.event === 'IncreaseLiquidity')
      tokenIdv3 = transferEvent?.args?.tokenId

      // permit, decrease, collect, burn
      const encodedErc721PermitCall = await permit()
      const encodedDecreaseCall = await decreaseLiquidity()
      // set receiver to v4posm
      const encodedCollectCall = collect(v4PositionManager.address)
      const encodedBurnCall = encodeBurn(tokenIdv3)

      planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // bob successfully sweeped his usdc and weth from the v4 position manager
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(0)
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(0)

      // bob does not own a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(0)

      // bob owns a v4position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)
      expect(await v4PositionManager.ownerOf(expectedTokenId)).to.eq(bob.address)
    })

    it('migrate with increasing does not succeed', async () => {
      // transfer to v4posm
      await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
      await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

      // initialize the pool
      await v4PositionManager.connect(bob).initializePool(USDC_WETH.poolKey, USDC_WETH.price)

      v4Planner.addAction(Actions.MINT_POSITION, [
        USDC_WETH.poolKey,
        USDC_WETH.tickLower,
        USDC_WETH.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // bob does not own a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(0)

      // bob owns a v4position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)

      // bob successfully sweeped his usdc and weth from the v4 position manager
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(0)
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(0)

      // migrate with increasing
      planner = new RoutePlanner()
      v4Planner = new V4Planner()
      // Bob max-approves the v3PM to access his USDC and WETH
      await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
      await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

      // mint the nft to bob on v3
      const tx = await v3NFTPositionManager.mint({
        token0: USDC.address,
        token1: WETH.address,
        fee: FeeAmount.LOW,
        tickLower: 0,
        tickUpper: 194980,
        amount0Desired: expandTo6DecimalsBN(2500),
        amount1Desired: expandTo18DecimalsBN(1),
        amount0Min: 0,
        amount1Min: 0,
        recipient: bob.address,
        deadline: MAX_UINT,
      })

      const receipt = await tx.wait()
      const transferEvent = receipt.events?.find((event) => event.event === 'IncreaseLiquidity')
      tokenIdv3 = transferEvent?.args?.tokenId

      // bob owns a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(1)

      // permit, decrease, collect, burn
      let encodedErc721PermitCall = await permit()
      const encodedDecreaseCall = await decreaseLiquidity()
      // set receiver to v4posm
      const encodedCollectCall = collect(v4PositionManager.address)
      const encodedBurnCall = encodeBurn(tokenIdv3)

      planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

      // need to permit the router to spend the nft first
      let { compact } = await getPermitV4Signature(bob, v4PositionManager, router.address, expectedTokenId, MAX_UINT, {
        nonce: 1,
      })

      let erc721PermitParams = {
        spender: router.address,
        tokenId: expectedTokenId,
        deadline: MAX_UINT,
        nonce: 1,
        signature: compact,
      }

      encodedErc721PermitCall = encodeERC721PermitV4(erc721PermitParams)

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedErc721PermitCall])

      // increase params for bob's position
      v4Planner.addAction(Actions.INCREASE_LIQUIDITY, [expectedTokenId, '6000000', MAX_UINT128, MAX_UINT128, '0x'])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [WETH.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [WETH.address, bob.address])

      calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      // Need to "un-permit" the router (permit address 0) so that the router can no longer spend the nft
      // if the router is not unpermitted, anyone can call V4_POSITION_MANAGER_CALL and decrease / burn the position
      compact = (
        await getPermitV4Signature(bob, v4PositionManager, ZERO_ADDRESS, expectedTokenId, MAX_UINT, { nonce: 2 })
      ).compact

      erc721PermitParams = {
        spender: ZERO_ADDRESS,
        tokenId: expectedTokenId,
        deadline: MAX_UINT,
        nonce: 2,
        signature: compact,
      }

      encodedErc721PermitCall = encodeERC721PermitV4(erc721PermitParams)

      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedErc721PermitCall])

      await expect(
        executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)
      ).to.be.revertedWithCustomError(router, 'InvalidAction')
    })

    it('migrate a weth position into an eth position by forwarding eth, with initialize pool', async () => {
      // Bob max-approves the v3PM to access his USDC and WETH
      await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
      await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [ETH_USDC.poolKey, ETH_USDC.price])

      // mint the nft to bob on v3
      const tx = await v3NFTPositionManager.mint({
        token0: USDC.address,
        token1: WETH.address,
        fee: FeeAmount.LOW,
        tickLower: 0,
        tickUpper: 194980,
        amount0Desired: expandTo6DecimalsBN(2500),
        amount1Desired: expandTo18DecimalsBN(1),
        amount0Min: 0,
        amount1Min: 0,
        recipient: bob.address,
        deadline: MAX_UINT,
      })

      // bob owns a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(1)

      // bob does not own a v4position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(0)

      const receipt = await tx.wait()
      const transferEvent = receipt.events?.find((event) => event.event === 'IncreaseLiquidity')
      tokenIdv3 = transferEvent?.args?.tokenId

      // permit, decrease, collect, burn
      const encodedErc721PermitCall = await permit()
      const encodedDecreaseCall = await decreaseLiquidity()
      // set receiver to v4posm
      const encodedCollectCall = collect(router.address)
      const encodedBurnCall = encodeBurn(tokenIdv3)

      planner.addCommand(CommandType.V3_POSITION_MANAGER_PERMIT, [encodedErc721PermitCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

      // unwrap weth to eth and set router as recipient
      planner.addCommand(CommandType.UNWRAP_WETH, [router.address, 0])

      // transfer usdc to v4 position manager
      planner.addCommand(CommandType.TRANSFER, [USDC.address, v4PositionManager.address, CONTRACT_BALANCE])

      v4Planner.addAction(Actions.MINT_POSITION, [
        ETH_USDC.poolKey,
        ETH_USDC.tickLower,
        ETH_USDC.tickUpper,
        '6000000',
        MAX_UINT128,
        MAX_UINT128,
        bob.address,
        '0x',
      ])

      v4Planner.addAction(Actions.SETTLE, [USDC.address, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SETTLE, [ADDRESS_ZERO, OPEN_DELTA, SOURCE_ROUTER])
      v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
      v4Planner.addAction(Actions.SWEEP, [ADDRESS_ZERO, bob.address])

      let calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

      // mint the v4 position and transfer eth to the v4 position manager
      planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

      let expectedTokenId = await v4PositionManager.nextTokenId()

      await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

      // bob successfully sweeped his usdc and weth from the v4 position manager
      expect(await wethContract.balanceOf(v4PositionManager.address)).to.eq(0)
      expect(await usdcContract.balanceOf(v4PositionManager.address)).to.eq(0)

      // bob does not own a v3position
      expect(await v3NFTPositionManager.balanceOf(bob.address)).to.eq(0)

      // bob owns a v4position
      expect(await v4PositionManager.balanceOf(bob.address)).to.eq(1)
      expect(await v4PositionManager.ownerOf(expectedTokenId)).to.eq(bob.address)
    })
  })

  async function permit(): Promise<string> {
    const { v, r, s } = await getPermitNFTSignature(bob, v3NFTPositionManager, router.address, tokenIdv3, MAX_UINT)

    const erc721PermitParams = {
      spender: router.address,
      tokenId: tokenIdv3,
      deadline: MAX_UINT,
      v: v,
      r: r,
      s: s,
    }

    return encodeERC721Permit(erc721PermitParams)
  }

  async function decreaseLiquidity(): Promise<string> {
    let position = await v3NFTPositionManager.positions(tokenIdv3)
    let liquidity = position.liquidity

    const decreaseParams = {
      tokenId: tokenIdv3,
      liquidity: liquidity,
      amount0Min: 0,
      amount1Min: 0,
      deadline: MAX_UINT,
    }

    return encodeDecreaseLiquidity(decreaseParams)
  }

  function collect(recipient: string): string {
    // set receiver to v4posm
    const collectParams = {
      tokenId: tokenIdv3,
      recipient: recipient,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    }

    return encodeCollect(collectParams)
  }
})
