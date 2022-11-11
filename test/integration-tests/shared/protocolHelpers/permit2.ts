import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import hre from 'hardhat'
import PERMIT2_COMPILE from '../../../../artifacts/permit2/src/Permit2.sol/Permit2.json'
import { Permit2 } from '../../../../typechain'

const { ethers } = hre

const chainId: number = hre.network.config.chainId ? hre.network.config.chainId : 1

export type PermitDetails = {
  token: string
  amount: number | BigNumber
  expiration: number | BigNumber
  nonce: number | BigNumber
}

export type PermitSingle = {
  details: PermitDetails
  spender: string
  sigDeadline: number | BigNumber
}

export type PermitBatch = {
  details: PermitDetails[]
  spender: string
  sigDeadline: number | BigNumber
}

export type TransferDetail = {
  from: string
  to: string
  amount: number | BigNumber
  token: string
}

export const PERMIT2_PERMIT_TYPE = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
}

export const PERMIT2_PERMIT_BATCH_TYPE = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitBatch: [
    { name: 'details', type: 'PermitDetails[]' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
}

export const PERMIT2_INTERFACE = new ethers.utils.Interface(PERMIT2_COMPILE.abi)

export function getEip712Domain(chainId: number, verifyingContract: string) {
  return {
    name: 'Permit2',
    chainId,
    verifyingContract,
  }
}

export async function signPermit(
  permit: PermitSingle,
  signer: SignerWithAddress,
  verifyingContract: string
): Promise<string> {
  const eip712Domain = getEip712Domain(chainId, verifyingContract)
  const signature = await signer._signTypedData(eip712Domain, PERMIT2_PERMIT_TYPE, permit)

  return signature
}

export async function getPermitSignature(
  permit: PermitSingle,
  signer: SignerWithAddress,
  permit2: Permit2
): Promise<string> {
  // look up the correct nonce for this permit
  const nextNonce = (await permit2.allowance(signer.address, permit.details.token, permit.spender)).nonce
  permit.details.nonce = nextNonce
  return await signPermit(permit, signer, permit2.address)
}

export async function getPermitBatchSignature(
  permit: PermitBatch,
  signer: SignerWithAddress,
  permit2: Permit2
): Promise<string> {
  for (const i in permit.details) {
    const nextNonce = (await permit2.allowance(signer.address, permit.details[i].token, permit.spender)).nonce
    permit.details[i].nonce = nextNonce
  }

  return await signPermitBatch(permit, signer, permit2.address)
}

export async function signPermitBatch(
  permit: PermitBatch,
  signer: SignerWithAddress,
  verifyingContract: string
): Promise<string> {
  const eip712Domain = getEip712Domain(chainId, verifyingContract)
  const signature = await signer._signTypedData(eip712Domain, PERMIT2_PERMIT_BATCH_TYPE, permit)

  return signature
}
