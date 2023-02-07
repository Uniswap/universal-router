import ELEMENT_721_ABI from '../abis/Element.json'
import { BigNumber, BigNumberish, Signature } from 'ethers'
import { expandTo18DecimalsBN } from '../helpers'

import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const element721Orders = JSON.parse(
    fs.readFileSync('test/integration-tests/shared/orders/Element.json', { encoding: 'utf8' })
)

export const element721Interface = new ethers.utils.Interface(ELEMENT_721_ABI)

/*
buyERC721(
    (address,address,uint256,uint256,address,uint256,(address,uint256,bytes)[],address,uint256),
    (uint8,uint8,bytes32,bytes32)
)

struct NFTSellOrder {
        address maker;
        address taker;
        uint256 expiry;
        uint256 nonce;
        IERC20 erc20Token;
        uint256 erc20TokenAmount;
        Fee[] fees;
        address nft;
        uint256 nftId;
    }

struct Fee {
        address recipient;
        uint256 amount;
        bytes feeData;
}
*/

export type Order = {
    maker: string // address
    taker: string // address
    expiry: BigNumber
    nonce: BigNumber
    erc20Token: any
    erc20TokenAmount: BigNumber
    fees: Fee[]
    nft: string // address
    nftId: BigNumber
}

export type ElementOrderSignature = {
    signatureType: BigNumber // 0 for 721 and 1 for presigned
    v: BigNumber
    r: string // bytes32
    s: string // bytes32
}

export type Fee = {
    recipient: string // address
    amount: BigNumber
    feeData: string // bytes
}

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

export function getOrder(apiOrder: any): { order: Order; signature: ElementOrderSignature; value: BigNumber } {
    const exchangeData = JSON.parse(apiOrder.exchangeData)
    const order = {
        maker: apiOrder.maker,
        taker: apiOrder.taker,
        expiry: BigNumber.from(apiOrder.expirationTime),
        nonce: BigNumber.from(exchangeData.nonce),
        erc20Token: apiOrder.paymentToken,
        erc20TokenAmount: BigNumber.from(apiOrder.price),
        fees: [],
        nft: apiOrder.contractAddress,
        nftId: BigNumber.from(apiOrder.tokenId),
    }
    const value = BigNumber.from(apiOrder.priceBase)
    const signature = {
        signatureType: BigNumber.from(0), // TODO: don't think we have access to this data
        v: BigNumber.from(exchangeData.v),
        r: exchangeData.r,
        s: exchangeData.s,
    }
    return { order, signature, value }
}


