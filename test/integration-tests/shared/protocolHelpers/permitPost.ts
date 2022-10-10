import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import PERMIT_POST_COMPILE from '../../../../lib/permitpost/out/PermitPost.sol/PermitPost.json'

export type TokenDetails = {
  tokenType: number
  token: string
  maxAmount: BigNumber
  id: BigNumber
}

export type Permit = {
  tokens: TokenDetails[]
  spender: string
  deadline: BigNumber
  witness: string
}

export type Signature = {
  v: number
  r: string
  s: string
}

export const PERMIT_POST_TYPES = {
  TokenDetails: [
    { name: 'tokenType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'maxAmount', type: 'uint256' },
    { name: 'id', type: 'uint256' },
  ],
  Permit: [
    { name: 'sigType', type: 'uint8' },
    { name: 'tokens', type: 'TokenDetails[]' },
    { name: 'spender', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
}

export const PERMIT_POST_INTERFACE = new ethers.utils.Interface(PERMIT_POST_COMPILE.abi)

export function getEip712Domain(chainId: number, verifyingContract: string) {
  return {
    name: 'PermitPost',
    version: '1',
    chainId,
    verifyingContract,
  }
}

export async function signPermit(
  permit: Permit,
  signatureType: number,
  nonce: number,
  signer: SignerWithAddress,
  chainId: number,
  verifyingContract: string
): Promise<Signature> {
  const eip712Values = {
    sigType: signatureType,
    tokens: permit.tokens,
    spender: permit.spender,
    deadline: permit.deadline,
    witness: permit.witness,
    nonce: nonce,
  }
  const eip712Domain = getEip712Domain(chainId, verifyingContract)
  const signature = await signer._signTypedData(eip712Domain, PERMIT_POST_TYPES, eip712Values)

  return {
    r: '0x' + signature.slice(2, 66),
    s: '0x' + signature.slice(66, 130),
    v: Number('0x' + signature.slice(130)),
  }
}

export function constructPermitCalldata(
  permit: Permit,
  to: string[],
  amounts: BigNumber[],
  signature: Signature
): string {
  const calldata = PERMIT_POST_INTERFACE.encodeFunctionData('transferFrom', [
    ethers.constants.AddressZero,
    permit,
    to,
    amounts,
    signature,
  ])

  return '0x' + calldata.slice(74)
}
