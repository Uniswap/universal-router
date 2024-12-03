import type { Contract } from '@ethersproject/contracts'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployUniversalRouter from '../shared/deployUniversalRouter'
import { BigNumber } from 'ethers'
import { UniversalRouter, INonfungiblePositionManager, PositionManager } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, V3_NFT_POSITION_MANAGER } from '../shared/mainnetForkHelpers'
import {
  ALICE_ADDRESS,
  DEADLINE,
  MAX_UINT,
  MAX_UINT128,
  OPEN_DELTA,
  SOURCE_ROUTER,
  CONTRACT_BALANCE,
  ZERO_ADDRESS,
} from '../shared/constants'
import { expandTo18DecimalsBN, expandTo6DecimalsBN } from '../shared/helpers'
import getPermitNFTSignature from '../shared/getPermitNFTSignature'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { RoutePlanner, CommandType } from '../shared/planner'
import { FeeAmount } from '@uniswap/v3-sdk'
import {
  encodeERC721Permit,
  encodeDecreaseLiquidity,
  encodeCollect,
  encodeBurn,
  encodeModifyLiquidities,
} from '../shared/encodeCall'
const { ethers } = hre
import { USDC_WETH, ETH_USDC } from '../shared/v4Helpers'
import { V4Planner, Actions } from '../shared/v4Planner'

describe('V3 to V4 Migration Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
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
    daiContract = new ethers.Contract(DAI.address, TOKEN_ABI, bob)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, bob)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, bob)
    v3NFTPositionManager = V3_NFT_POSITION_MANAGER.connect(bob) as INonfungiblePositionManager
    router = (await deployUniversalRouter(bob.address)).connect(bob) as UniversalRouter
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

      const receipt = await tx.wait()

      const transferEvent = receipt.events?.find((event) => event.event === 'IncreaseLiquidity')

      tokenIdv3 = transferEvent?.args?.tokenId
    })

    describe('erc721permit', () => {
      it('gas: erc721permit', async () => {
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

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })
    describe('decrease liquidity', () => {
      it('gas: erc721permit + decreaseLiquidity', async () => {
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

        const decreaseParams = {
          tokenId: tokenIdv3,
          liquidity: liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: MAX_UINT,
        }

        const encodedDecreaseCall = encodeDecreaseLiquidity(decreaseParams)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })
    describe('collect', () => {
      it('gas: erc721permit + decreaseLiquidity + collect', async () => {
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

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })

    describe('burn', () => {
      it('gas: erc721permit + decreaseLiquidity + collect + burn', async () => {
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

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })
  })

  describe('V4 Commands', () => {
    describe('initialize pool', () => {
      it('gas: initialize a pool', async () => {
        planner.addCommand(CommandType.V4_INITIALIZE_POOL, [USDC_WETH.poolKey, USDC_WETH.price])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })

    describe('mint', () => {
      it('gas: mint', async () => {
        // transfer to v4posm
        await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
        await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

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

        const calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })

      it('gas: migrate and mint', async () => {
        // Bob max-approves the v3PM to access his USDC and WETH
        await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
        await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

        await v4PositionManager.connect(bob).initializePool(USDC_WETH.poolKey, USDC_WETH.price)

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
        let tokenIdv3 = transferEvent?.args?.tokenId

        // permit, decrease, collect, burn
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

        // set receiver to v4posm
        const collectParams = {
          tokenId: tokenIdv3,
          recipient: v4PositionManager.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        const encodedBurnCall = encodeBurn(tokenIdv3)

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

        const calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })

      it('gas: migrate weth position into eth position with forwarding', async () => {
        // Bob max-approves the v3PM to access his USDC and WETH
        await usdcContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)
        await wethContract.connect(bob).approve(v3NFTPositionManager.address, MAX_UINT)

        await v4PositionManager.connect(bob).initializePool(ETH_USDC.poolKey, USDC_WETH.price)

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
        let tokenIdv3 = transferEvent?.args?.tokenId

        // permit, decrease, collect, burn
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

        // set receiver to v4posm
        const collectParams = {
          tokenId: tokenIdv3,
          recipient: router.address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }

        const encodedCollectCall = encodeCollect(collectParams)

        const encodedBurnCall = encodeBurn(tokenIdv3)

        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedDecreaseCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedCollectCall])
        planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [encodedBurnCall])

        planner.addCommand(CommandType.UNWRAP_WETH, [router.address, 0])

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
        v4Planner.addAction(Actions.SETTLE, [ZERO_ADDRESS, OPEN_DELTA, SOURCE_ROUTER])
        v4Planner.addAction(Actions.SWEEP, [USDC.address, bob.address])
        v4Planner.addAction(Actions.SWEEP, [ZERO_ADDRESS, bob.address])

        const calldata = encodeModifyLiquidities({ unlockData: v4Planner.finalize(), deadline: MAX_UINT })

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [calldata])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })
  })
})
