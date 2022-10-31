import {CommandType, RoutePlanner} from './shared/planner'
import CRYPTOPUNKS_ABI from './shared/abis/Cryptopunks.json'
import {Router} from '../../typechain'
import {resetFork} from './shared/mainnetForkHelpers'
import {ALICE_ADDRESS, DEADLINE} from './shared/constants'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import hre from 'hardhat'
import {BigNumber} from 'ethers'
import {expect} from 'chai'
import deployRouter from './shared/deployRouter'

const { ethers } = hre

const CRYPTOPUNKS_INTERFACE = new ethers.utils.Interface(CRYPTOPUNKS_ABI)

describe('Cryptopunks', () => {
    let alice: SignerWithAddress
    let router: Router
    let planner: RoutePlanner
    let cryptopunkContract: any

    beforeEach(async () => {
        planner = new RoutePlanner()
        alice = await ethers.getSigner(ALICE_ADDRESS)

        await resetFork(15848050)
        await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [ALICE_ADDRESS],
        })
        router = (await deployRouter()).connect(alice) as Router
        cryptopunkContract = new ethers.Contract("0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB", CRYPTOPUNKS_ABI)
        cryptopunkContract = cryptopunkContract.connect(alice)
    })

    // In this test we will buy crypto punk # 2976 for 74.95 ETH
    describe('Buy 1 crypto punk', () => {
        it('purchases token ids 2976', async () => {
            const value = BigNumber.from('74950000000000000000')
            const buyPunkCalldata = CRYPTOPUNKS_INTERFACE.encodeFunctionData('buyPunk', [
                2976
            ])
            planner.addCommand(CommandType.CRYPTOPUNKS, [value, buyPunkCalldata])
            const transferPunkCalldata = CRYPTOPUNKS_INTERFACE.encodeFunctionData('transferPunk', [
                ALICE_ADDRESS,
                2976
            ])
            planner.addCommand(CommandType.CRYPTOPUNKS, [0, transferPunkCalldata])
            const { commands, inputs } = planner

            const aliceBalance = await ethers.provider.getBalance(alice.address)
            const receipt = await (
                await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value: value })
            ).wait()

            // Expect that alice has the NFT
            await expect((await cryptopunkContract.punkIndexToAddress(2976)).toLowerCase()).to.eq(ALICE_ADDRESS)
            await expect(aliceBalance.sub(await ethers.provider.getBalance(alice.address))).to.eq(
                value.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))
            )
        })
    })
})
