import {RouterPlanner, SudoswapCommand} from '@uniswap/narwhal-sdk'
import SUDOSWAP_ABI from './shared/abis/Sudoswap.json'
import {ERC721, Router} from '../../typechain'
import {resetFork} from './shared/mainnetForkHelpers'
import {
    ALICE_ADDRESS,
    DEADLINE,
    V2_FACTORY_MAINNET,
    V2_INIT_CODE_HASH_MAINNET,
    V3_FACTORY_MAINNET,
    V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import {BigNumber} from 'ethers'
import {abi as ERC721_ABI} from '../../artifacts/solmate/src/tokens/ERC721.sol/ERC721.json'
import {expect} from 'chai'

const { ethers } = hre

const SUDOSWAP_INTERFACE = new ethers.utils.Interface(SUDOSWAP_ABI)
const SUDOLETS_ADDRESS = '0xfa9937555dc20a020a161232de4d2b109c62aa9c'

describe('Sudoswap', () => {
    let alice: SignerWithAddress
    let router: Router
    let planner: RouterPlanner

    beforeEach(async () => {
        planner = new RouterPlanner()
        alice = await ethers.getSigner(ALICE_ADDRESS)
    })

    // In this test we will buy token ids 80, 35, 93 of Sudolets (0xfa9937555dc20a020a161232de4d2b109c62aa9c),
    // which costs 0.073 ETH (exactly 73337152777777783 wei)
    describe('Buy 3 sudolets from sudoswap', () => {
        let sudolets: ERC721

        beforeEach(async () => {
            await resetFork(15740629)
            await hre.network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [ALICE_ADDRESS],
            })
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

            sudolets = new ethers.Contract(SUDOLETS_ADDRESS, ERC721_ABI) as ERC721
        })

        it('purchases token ids 80, 35, 93 of Sudolets', async () => {
            const value = BigNumber.from('73337152777777783')
            const calldata = SUDOSWAP_INTERFACE.encodeFunctionData(
                'robustSwapETHForSpecificNFTs',
                [[[["0x339e7004372e04b1d59443f0ddc075efd9d80360", [
                    "80",
                    "35",
                    "93"
                ]], "73337152777777783"]], ALICE_ADDRESS, ALICE_ADDRESS, 1665685098]
            )
            planner.add(SudoswapCommand(value, calldata))
            const { commands, state } = planner.plan()

            const aliceBalance = await ethers.provider.getBalance(alice.address)
            const receipt = await (
                await router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: value })
            ).wait()

            // Expect that alice has the NFTs
            await expect((await sudolets.connect(alice).ownerOf(80)).toLowerCase()).to.eq(ALICE_ADDRESS)
            await expect((await sudolets.connect(alice).ownerOf(35)).toLowerCase()).to.eq(ALICE_ADDRESS)
            await expect((await sudolets.connect(alice).ownerOf(93)).toLowerCase()).to.eq(ALICE_ADDRESS)
            // Expect that alice's account has 0.073 (plus gas) less ETH in it
            await expect(aliceBalance.sub(await ethers.provider.getBalance(alice.address))).to.eq(
                value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))
            )
        })

        it('gas: purchases token ids 80, 35, 93 of Sudolets', async () => {
            const value = BigNumber.from('73337152777777783')
            const calldata = SUDOSWAP_INTERFACE.encodeFunctionData(
                'robustSwapETHForSpecificNFTs',
                [[[["0x339e7004372e04b1d59443f0ddc075efd9d80360", [
                    "80",
                    "35",
                    "93"
                ]], "73337152777777783"]], ALICE_ADDRESS, ALICE_ADDRESS, 1665685098]
            )
            planner.add(SudoswapCommand(value, calldata))
            const { commands, state } = planner.plan()
            await snapshotGasCost(router['execute(bytes,bytes[],uint256)'](commands, state, DEADLINE, { value: value }))
        })
    })
})
