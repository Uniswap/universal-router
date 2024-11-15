import hre from 'hardhat'
const { ethers } = hre

// Router Helpers
export const MAX_UINT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
export const MAX_UINT128 = '0xffffffffffffffffffffffffffffffff'
export const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff'
export const DEADLINE = 2000000000
export const CONTRACT_BALANCE = '0x8000000000000000000000000000000000000000000000000000000000000000'
export const OPEN_DELTA = 0
export const ALREADY_PAID = 0
export const ALICE_ADDRESS = '0x28c6c06298d514db089934071355e5743bf21d60'
export const ETH_ADDRESS = ethers.constants.AddressZero
export const ZERO_ADDRESS = ethers.constants.AddressZero
export const ONE_PERCENT_BIPS = 100
export const MSG_SENDER: string = '0x0000000000000000000000000000000000000001'
export const ADDRESS_THIS: string = '0x0000000000000000000000000000000000000002'
export const SOURCE_MSG_SENDER: boolean = true
export const SOURCE_ROUTER: boolean = false

// Constructor Params
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
export const V2_FACTORY_MAINNET = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
export const V3_FACTORY_MAINNET = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
export const V3_INIT_CODE_HASH_MAINNET = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54'
export const V2_INIT_CODE_HASH_MAINNET = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
export const V3_NFT_POSITION_MANAGER_MAINNET = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
export const V4_POSITION_DESCRIPTOR_ADDRESS = '0x0000000000000000000000000000000000000000' // TODO, deploy this in-line and use the proper address in posm's constructor
export const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
