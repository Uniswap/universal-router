import ELEMENT_721_ABI from '../abis/Element.json'
import { BigNumber, BigNumberish, Signature } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'

const CONTRACTS_ADDRESSES = {
    1: {
        ElementEx: '0x20F780A973856B93f63670377900C1d2a50a77c4',
        ElementExSwapV2: '0xb4E7B8946fA2b35912Cc0581772cCCd69A33000c',
        Helper: '0x68dc8D3ab93220e84b9923706B3DDc926C77f1Df',
        WToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        Seaport: '0x00000000006c3852cbef3e08e8df289169ede581',
        LooksRare: '0x59728544b08ab483533076417fbbb2fd0b17ce3a'
    },
    137: {
        ElementEx: '0xEAF5453b329Eb38Be159a872a6ce91c9A8fb0260',
        ElementExSwapV2: '0x25956Fd0A5FE281D921b1bB3499fc8D5EFea6201',
        Helper: '0x4D5E03AF11d7976a0494f0ff2F65986d6548fc3e',
        WToken: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
    },
}

import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const element721Orders = JSON.parse(
    fs.readFileSync('test/integration-tests/shared/orders/Element.json', { encoding: 'utf8' })
)

export const element721Interface = new ethers.utils.Interface(ELEMENT_721_ABI)

/*
  {
        "contractAddress": "0x88af41822c65a64e9614d3784fa1c99b8a02e5f5",
        "tokenId": "2",
        "standard": "element-ex-v3",
        "orderHash": "0xa44550c8883cc36fb98266e45bbae2569db44f8b7cd55e91dc39f89833716654",
        "paymentToken": "0x0000000000000000000000000000000000000000",
        "maker": "0x633f6c7e25ee757d12643a32ce1586ac9e8542d5",
        "listingTime": 1665488710,
        "side": 1,
        "saleKind": 0,
        "price": 0.025,
        "isValid": true,
        "errorDetail": "string",
        "taker": "0x0000000000000000000000000000000000000000",
        "expirationTime": 1666093622,
        "quantity": "1",
        "priceBase": 0.2,
        "priceUsd": 309.7634,
        "schema": "ERC721",
        "basePrice": "120000000000000000",
        "exchangeData": "{\"order\":{\"maker\":\"0x633f6c7e25ee757d12643a32ce1586ac9e8542d5\",\"taker\":\"0x0000000000000000000000000000000000000000\",\"expiry\":\"0x000000000000000000000000000000000000000000000000636122e0636a5d9c\",\"nonce\":\"99\",\"erc20Token\":\"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",\"erc20TokenAmount\":\"174000000000000000\",\"fees\":[{\"recipient\":\"0x00cA62445B06a9aDc1879a44485B4eFdcB7b75F3\",\"amount\":\"16000000000000000\",\"feeData\":\"0x\"},{\"recipient\":\"0x9226f7df5e316df051f0490ce3b753c51695d0bb\",\"amount\":\"10000000000000000\",\"feeData\":\"0x\"}],\"nft\":\"0x88af41822c65a64e9614d3784fa1c99b8a02e5f5\",\"nftId\":\"64\",\"hashNonce\":\"0\"},\"signature\":{\"signatureType\":0,\"v\":28,\"r\":\"0xc5f7bf427f39c3ce3fe39b7c981b7d60f2805a970caae6bd971d476431731706\",\"s\":\"0x04313baeb7397394ac40af76969be987e89bb221a862b5f0f97082d503fa6c16\"}}"
  }
*/

type ElementSupportedChains = 1 | 137

export type ElementOrderSignature = {
    signatureType: number // 0 for 721 and 1 for presigned
    v: number
    r: string // bytes32
    s: string // bytes32
}

export interface OrderItem {
    erc20TokenAmount: string;
    nftId: string;
}

export interface Fee {
    recipient: string;
    amount: string;
    feeData: string;
}

export interface Property {
    propertyValidator: string;
    propertyData: string;
}

// Signing over this:
export interface ERC721Order {
    maker: string;
    taker: string;
    expiry: string;
    nonce: string;
    erc20Token: string;
    erc20TokenAmount: string;
    fees: Fee[];
    nft: string;
    nftId: string;
    nftProperties?: Property[];
    hashNonce: string;
}

export interface ERC1155Order {
    maker: string;
    taker: string;
    expiry: string;
    nonce: string;
    erc20Token: string;
    erc20TokenAmount: string;
    fees: Fee[];
    erc1155Token: string;
    erc1155TokenId: string;
    erc1155TokenAmount: string;
    erc1155TokenProperties?: Property[];
    hashNonce: string;
}

export interface SignedOrder {
    chainId: number;
    order: ERC721Order | ERC1155Order;
    signature: ElementOrderSignature;
    orderHash: string;
}

const FEE_ABI = [
    { type: 'address', name: 'recipient' },
    { type: 'uint256', name: 'amount' },
    { type: 'bytes', name: 'feeData' }
]
const PROPERTY_ABI = [
    { type: 'address', name: 'propertyValidator' },
    { type: 'bytes', name: 'propertyData' }
]

// ERC721Order EIP712 information
const STRUCT_ERC721_SELL_ORDER_ABI = [
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'uint256', name: 'expiry' },
    { type: 'uint256', name: 'nonce' },
    { type: 'address', name: 'erc20Token' },
    { type: 'uint256', name: 'erc20TokenAmount' },
    { type: 'Fee[]', name: 'fees' },
    { type: 'address', name: 'nft' },
    { type: 'uint256', name: 'nftId' },
    { type: 'uint256', name: 'hashNonce' }
]
const STRUCT_ERC721_BUY_ORDER_ABI = [
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'uint256', name: 'expiry' },
    { type: 'uint256', name: 'nonce' },
    { type: 'address', name: 'erc20Token' },
    { type: 'uint256', name: 'erc20TokenAmount' },
    { type: 'Fee[]', name: 'fees' },
    { type: 'address', name: 'nft' },
    { type: 'uint256', name: 'nftId' },
    { type: 'Property[]', name: 'nftProperties' },
    { type: 'uint256', name: 'hashNonce' }
]

// ERC1155Order EIP712 information
const STRUCT_ERC1155_SELL_ORDER_ABI = [
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'uint256', name: 'expiry' },
    { type: 'uint256', name: 'nonce' },
    { type: 'address', name: 'erc20Token' },
    { type: 'uint256', name: 'erc20TokenAmount' },
    { type: 'Fee[]', name: 'fees' },
    { type: 'address', name: 'erc1155Token' },
    { type: 'uint256', name: 'erc1155TokenId' },
    { type: 'uint128', name: 'erc1155TokenAmount' },
    { type: 'uint256', name: 'hashNonce' }
]
const STRUCT_ERC1155_BUY_ORDER_ABI = [
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'uint256', name: 'expiry' },
    { type: 'uint256', name: 'nonce' },
    { type: 'address', name: 'erc20Token' },
    { type: 'uint256', name: 'erc20TokenAmount' },
    { type: 'Fee[]', name: 'fees' },
    { type: 'address', name: 'erc1155Token' },
    { type: 'uint256', name: 'erc1155TokenId' },
    { type: 'Property[]', name: 'erc1155TokenProperties' },
    { type: 'uint128', name: 'erc1155TokenAmount' },
    { type: 'uint256', name: 'hashNonce' }
]

export function getOrderTypedData(order: ERC721Order | ERC1155Order, chainId: ElementSupportedChains) {
    if ('nft' in order) {
        return getERC721TypedData(order as ERC721Order, chainId)
    } else {
        return getERC1155TypedData(order as ERC1155Order, chainId)
    }
}

function getERC721TypedData(order: ERC721Order, chainId: ElementSupportedChains) {
    if (order.nftProperties == null) {
        // ERC721SellOrder
        return {
            types: {
                ['NFTSellOrder']: STRUCT_ERC721_SELL_ORDER_ABI,
                ['Fee']: FEE_ABI
            },
            domain: getDomain(chainId),
            primaryType: 'NFTSellOrder',
            message: order as any
        }
    } else {
        // ERC721BuyOrder
        return {
            types: {
                ['NFTBuyOrder']: STRUCT_ERC721_BUY_ORDER_ABI,
                ['Fee']: FEE_ABI,
                ['Property']: PROPERTY_ABI
            },
            domain: getDomain(chainId),
            primaryType: 'NFTBuyOrder',
            message: order as any
        }
    }
}

function getERC1155TypedData(order: ERC1155Order, chainId: ElementSupportedChains) {
    if (order.erc1155TokenProperties == undefined) {
        // ERC1155SellOrder
        return {
            types: {
                ['ERC1155SellOrder']: STRUCT_ERC1155_SELL_ORDER_ABI,
                ['Fee']: FEE_ABI
            },
            domain: getDomain(chainId),
            primaryType: 'ERC1155SellOrder',
            message: order as any
        }
    } else {
        // ERC1155BuyOrder
        return {
            types: {
                ['ERC1155BuyOrder']: STRUCT_ERC1155_BUY_ORDER_ABI,
                ['Fee']: FEE_ABI,
                ['Property']: PROPERTY_ABI
            },
            domain: getDomain(chainId),
            primaryType: 'ERC1155BuyOrder',
            message: order as any
        }
    }
}

function getDomain(chainId: ElementSupportedChains) {
    return {
        name: 'ElementEx',
        version: '1.0.0',
        chainId: chainId,
        verifyingContract: CONTRACTS_ADDRESSES[chainId].ElementEx.toLowerCase()
    }
}

// export function getOrder(apiOrder: any): { order: Order; signature: ElementOrderSignature; value: BigNumber } {
//     const exchangeData = JSON.parse(apiOrder.exchangeData)
//     const order = {
//         maker: apiOrder.maker,
//         taker: apiOrder.taker,
//         expiry: BigNumber.from(apiOrder.expirationTime),
//         nonce: BigNumber.from(exchangeData.nonce),
//         erc20Token: apiOrder.paymentToken,
//         erc20TokenAmount: BigNumber.from(apiOrder.price),
//         fees: [],
//         nft: apiOrder.contractAddress,
//         nftId: BigNumber.from(apiOrder.tokenId),
//     }
//     const value = BigNumber.from(apiOrder.priceBase)
//     const signature = {
//         signatureType: BigNumber.from(0), // TODO: don't think we have access to this data
//         v: BigNumber.from(exchangeData.v),
//         r: exchangeData.r,
//         s: exchangeData.s,
//     }
//     return { order, signature, value }
// }


