import type { Contract } from '@ethersproject/contracts'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import deployUniversalRouter from '../shared/deployUniversalRouter'
import { BigNumber } from 'ethers'
import { UniversalRouter, INonfungiblePositionManager, PositionManager } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/src/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, DAI, USDC, V3_NFT_POSITION_MANAGER } from '../shared/mainnetForkHelpers'
import { ALICE_ADDRESS, DEADLINE, MAX_UINT, MAX_UINT128 } from '../shared/constants'
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
  encodeMintData,
  encodeIncreaseData,
  encodeSettleBalance,
  encodeUnlockData,
  encodeSweep,
  encodeModifyLiquidities,
} from '../shared/encodeCall'
const { ethers } = hre
import { executeRouter } from '../shared/executeRouter'

describe('V3 to V4 Migration Gas Tests', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: UniversalRouter
  let daiContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner
  let v3NFTPositionManager: INonfungiblePositionManager
  let v4PositionManagerAddress: string
  let v4PositionManager: PositionManager

  let tokenIdv3: BigNumber

  const MINT_POSITION = 0x02
  const INCREASE_LIQUIDITY = 0x00
  const SETTLE_WITH_BALANCE = 0x12
  const SWEEP = 0x19

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
    router = (await deployUniversalRouter()).connect(bob) as UniversalRouter
    v4PositionManagerAddress = await router.V4_POSITION_MANAGER()
    v4PositionManager = (await ethers.getContractAt('PositionManager', v4PositionManagerAddress)) as PositionManager
    planner = new RoutePlanner()

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
    beforeEach(async () => {
      // initialize new pool on v4
      await v4PositionManager.connect(bob).initializePool(
        {
          currency0: USDC.address,
          currency1: WETH.address,
          fee: FeeAmount.LOW,
          tickSpacing: 10,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        '79228162514264337593543950336',
        '0x'
      )
    })

    describe('mint', () => {
      it('gas: mint', async () => {
        // transfer to v4posm
        await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
        await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

        const mintParams = {
          LiquidityRange: {
            PoolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: FeeAmount.LOW,
              tickSpacing: 10,
              IHooks: '0x0000000000000000000000000000000000000000',
            },
            tickLower: 0,
            tickUpper: 194980,
          },
          liquidity: '6000000',
          owner: bob.address,
          hookData: '0x',
        }

        const encodedMintData = encodeMintData(mintParams)

        const encodedSettleBalance0 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency0, MAX_UINT)
        const encodedSettleBalance1 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency1, MAX_UINT)

        const encodedSweep0 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency0, bob.address)
        const encodedSweep1 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency1, bob.address)

        const unlockDataParams = {
          actions: [MINT_POSITION, SETTLE_WITH_BALANCE, SETTLE_WITH_BALANCE, SWEEP, SWEEP],
          unlockParams: [encodedMintData, encodedSettleBalance0, encodedSettleBalance1, encodedSweep0, encodedSweep1],
        }

        const encodedUnlockData = encodeUnlockData(unlockDataParams)

        const modifyLiquiditiesParams = {
          unlockData: encodedUnlockData,
          deadline: MAX_UINT,
        }

        const encodedModifyLiquiditiesCall = encodeModifyLiquidities(modifyLiquiditiesParams)

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedModifyLiquiditiesCall])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })

      it('gas: migrate and mint', async () => {
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

        const mintParams = {
          LiquidityRange: {
            PoolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: FeeAmount.LOW,
              tickSpacing: 10,
              IHooks: '0x0000000000000000000000000000000000000000',
            },
            tickLower: 0,
            tickUpper: 194980,
          },
          liquidity: '6000000',
          owner: bob.address,
          hookData: '0x',
        }

        const encodedMintData = encodeMintData(mintParams)

        const encodedSettleBalance0 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency0, MAX_UINT)
        const encodedSettleBalance1 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency1, MAX_UINT)

        const encodedSweep0 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency0, bob.address)
        const encodedSweep1 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency1, bob.address)

        let unlockDataParams = {
          actions: [MINT_POSITION, SETTLE_WITH_BALANCE, SETTLE_WITH_BALANCE, SWEEP, SWEEP],
          unlockParams: [encodedMintData, encodedSettleBalance0, encodedSettleBalance1, encodedSweep0, encodedSweep1],
        }

        let encodedUnlockData = encodeUnlockData(unlockDataParams)

        let modifyLiquiditiesParams = {
          unlockData: encodedUnlockData,
          deadline: MAX_UINT,
        }

        let encodedModifyLiquiditiesCall = encodeModifyLiquidities(modifyLiquiditiesParams)

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedModifyLiquiditiesCall])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })

    describe('increase', () => {
      it('gas: increase', async () => {
        // mint position first
        await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(100000))
        await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(100))

        const mintParams = {
          LiquidityRange: {
            PoolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: FeeAmount.LOW,
              tickSpacing: 10,
              IHooks: '0x0000000000000000000000000000000000000000',
            },
            tickLower: 0,
            tickUpper: 194980,
          },
          liquidity: '6000000',
          owner: bob.address,
          hookData: '0x',
        }

        const encodedMintData = encodeMintData(mintParams)

        const encodedSettleBalance0 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency0, MAX_UINT)
        const encodedSettleBalance1 = encodeSettleBalance(mintParams.LiquidityRange.PoolKey.currency1, MAX_UINT)

        const encodedSweep0 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency0, bob.address)
        const encodedSweep1 = encodeSweep(mintParams.LiquidityRange.PoolKey.currency1, bob.address)

        let unlockDataParams = {
          actions: [MINT_POSITION, SETTLE_WITH_BALANCE, SETTLE_WITH_BALANCE, SWEEP, SWEEP],
          unlockParams: [encodedMintData, encodedSettleBalance0, encodedSettleBalance1, encodedSweep0, encodedSweep1],
        }

        let encodedUnlockData = encodeUnlockData(unlockDataParams)

        let modifyLiquiditiesParams = {
          unlockData: encodedUnlockData,
          deadline: MAX_UINT,
        }

        let encodedModifyLiquiditiesCall = encodeModifyLiquidities(modifyLiquiditiesParams)

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedModifyLiquiditiesCall])

        await executeRouter(planner, bob, router, wethContract, daiContract, usdcContract)

        // increase position second
        planner = new RoutePlanner()
        await usdcContract.connect(bob).transfer(v4PositionManager.address, expandTo6DecimalsBN(10000))
        await wethContract.connect(bob).transfer(v4PositionManager.address, expandTo18DecimalsBN(10))

        // TODO: grab tokenID
        const increaseParams = {
          tokenId: 1,
          LiquidityRange: {
            PoolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: FeeAmount.LOW,
              tickSpacing: 10,
              IHooks: '0x0000000000000000000000000000000000000000',
            },
            tickLower: 0,
            tickUpper: 194980,
          },
          liquidity: '6000000',
          hookData: '0x',
        }

        const encodedIncreaseData = encodeIncreaseData(increaseParams)

        unlockDataParams = {
          actions: [INCREASE_LIQUIDITY, SETTLE_WITH_BALANCE, SETTLE_WITH_BALANCE, SWEEP, SWEEP],
          unlockParams: [
            encodedIncreaseData,
            encodedSettleBalance0,
            encodedSettleBalance1,
            encodedSweep0,
            encodedSweep1,
          ],
        }

        encodedUnlockData = encodeUnlockData(unlockDataParams)

        modifyLiquiditiesParams = {
          unlockData: encodedUnlockData,
          deadline: MAX_UINT,
        }

        encodedModifyLiquiditiesCall = encodeModifyLiquidities(modifyLiquiditiesParams)

        planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [encodedModifyLiquiditiesCall])

        const { commands, inputs } = planner
        await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE))
      })
    })
  })
})
