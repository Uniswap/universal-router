import {RouterPlanner, FoundationCommand} from '@uniswap/narwhal-sdk'
import FOUNDATION_ABI from './shared/abis/Foundation.json'
import { Router } from '../../typechain'
import { resetFork } from './shared/mainnetForkHelpers'
import {
    ALICE_ADDRESS,
    DEADLINE,
    V2_FACTORY_MAINNET,
    V3_FACTORY_MAINNET,
    V2_INIT_CODE_HASH_MAINNET,
    V3_INIT_CODE_HASH_MAINNET,
} from './shared/constants'
// import snapshotGasCost from '@uniswap/snapshot-gas-cost'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import { BigNumber } from 'ethers'
const { ethers } = hre

const FOUNDATION_INTERFACE = new ethers.utils.Interface(FOUNDATION_ABI)

describe('Foundation', () => {
    let alice: SignerWithAddress
    let router: Router
    let planner: RouterPlanner

    beforeEach(async () => {
        planner = new RouterPlanner()
        alice = await ethers.getSigner(ALICE_ADDRESS)
    })

    describe('ERC-721 purchase', () => {

        beforeEach(async () => {
            await resetFork(15725945)
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
        })

        it.only('purchases 1 ERC-721 on Foundation', async () => {

            const value = BigNumber.from('10000000000000000');
            const calldata = FOUNDATION_INTERFACE.encodeFunctionData('buyV2', [
                '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
                32,
                value,
                '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C'
            ])
            planner.add(FoundationCommand(value, calldata, ALICE_ADDRESS, '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c', 32))
            const { commands, state } = planner.plan()

            const receipt = await (await router.execute(DEADLINE, commands, state, { value: value })).wait()
            console.log(receipt)
            // const erc721TransferEvent = parseEvents(ERC721_INTERFACE, receipt)[1]?.args!

            // const newOwner = await ENS_721.connect(alice).ownerOf(erc721Order.token_id)
            // await expect(newOwner.toLowerCase()).to.eq(ALICE_ADDRESS)
            // await expect(erc721TransferEvent.from).to.be.eq(router.address)
            // await expect(erc721TransferEvent.to.toLowerCase()).to.be.eq(ALICE_ADDRESS)
            // await expect(erc721TransferEvent.id).to.be.eq(erc721Order.token_id)
        })

        // it('gas purchases 1 ERC-721 on Foundation', async () => {
        //     await snapshotGasCost(router.execute(DEADLINE, commands, state, { value: erc721Order.price }))
        // })
    })
})
