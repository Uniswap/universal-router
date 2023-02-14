import ELEMENT_721_ABI from '../abis/Element.json'
import { BigNumber, BigNumberish, Signature } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'
import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const element721Orders = JSON.parse(
    fs.readFileSync('test/integration-tests/shared/orders/Element.json', { encoding: 'utf8' })
).data.orders

export const element721Interface = new ethers.utils.Interface(ELEMENT_721_ABI)

export type ElementOrderSignature = {
    signatureType: number // 0 for 721 and 1 for presigned
    v: number
    r: string // bytes32
    s: string // bytes32
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


// https://polygonscan.com/tx/0x63045765f2a6ba7ebd5b2fe524b41fb8fa2c0128958631f1409bd543384a5b40#eventlog
export const EXAMPLE_NFT_SELL_ORDER: NFTSellOrder = {
    maker: "0xFfd3b35d3aeadD47c0A99259eE8be899983D9441",
    taker: "0x0000000000000000000000000000000000000000",
    expiry: "1675972593",
    nonce: "1",
    erc20Token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // native token for Element
    erc20TokenAmount: "34500000000000000000",
    fees: [],
    nft: "0xA5F1Ea7DF861952863dF2e8d1312f7305dabf215",
    nftId: "152807",
    nftProperties: [],
    hashNonce: "0"
}

export const EXAMPLE_NFT_SELL_ORDER_SIG: ElementOrderSignature = {
    signatureType: 0,
    v: 28,
    r: "0x2102a204f2f62acf6a44c7a43c0f9a3d972231cee0ab69f682301a29d09c0f29",
    s: "0x6a6095f94a58856df46c286c792a08ae2f256f3a32f4e502f70a912e73761216"
}

// Signing over this:
export interface NFTSellOrder {
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

export interface ERC1155SellOrder {
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
}

// block 39257188
const EXAMPLE_API_ORDER = {
    "basicCollections": [
        {
            "nftAddress": "0x56d46be8dd52ccd0551350e9e783a8282584e868",
            "platformFee": 200,
            "royaltyFeeRecipient": "0x0000000000000000000000000000000000000000",
            "royaltyFee": 0,
            "items": [
                {
                    "erc20TokenAmount": "1200000000000000000",
                    "nftId": "1540"
                }
            ]
        }
    ],
    "collections": null,
    "startNonce": 2,
    "nonce": 2,
    "hashNonce": "0",
    "platformFeeRecipient": "0xd207842d66b715df6ea08cf52f025b9e2ed28788",
    "v": 28,
    "r": "0xa837991196760d5e2953ce0ebb386ff85db84e918645850cc0eb9e60c67e9892",
    "s": "0x2117cea84c0c2bac7cfda6b799ec376fb35d8d1c5492be7a87f8f8fd324d963e",
    "listingTime": 1676318726,
    "expirationTime": 1684094785,
    "maker": "0x3d2d40700cb8ac8114e669ea4a70ff61bfea802a",
    "hash": "0x2039d65fead7c00ab1704290b4ddfe84c5ab9156f4dc6384ce8e5568b56f20f6",
    "paymentToken": "0x0000000000000000000000000000000000000000"
}

export function getOrder(apiOrder: any): { order: NFTSellOrder; signature: ElementOrderSignature; value: BigNumber } {
    const exchangeData: typeof EXAMPLE_API_ORDER = JSON.parse(apiOrder.exchangeData)

    const value = BigNumber.from(exchangeData.basicCollections[0].items[0].erc20TokenAmount)
    const feeAmount = 0.024 * (10 ** 18) / 10000

    const order = {
        maker: apiOrder.maker,
        taker: apiOrder.taker,
        expiry: apiOrder.expirationTime,
        nonce: String(exchangeData.nonce),
        erc20Token: apiOrder.paymentToken,
        erc20TokenAmount: value.toString(),
        fees: [{
            recipient: exchangeData.platformFeeRecipient,
            amount: feeAmount.toString(),
            feeData: '0x',
        }],
        // fees: [],
        nft: apiOrder.contractAddress,
        nftId: apiOrder.tokenId,
        nftProperties: [],
        hashNonce: exchangeData.hashNonce,
    }
    console.log(order)
    const signature = {
        signatureType: 0, // TODO: don't think we have access to this data
        v: exchangeData.v,
        r: exchangeData.r,
        s: exchangeData.s,
    }
    return { order, signature, value }
}


