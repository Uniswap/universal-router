import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import hre from 'hardhat'
import PERMIT2_COMPILE from '../../../../artifacts/permit2/src/Permit2.sol/Permit2.json'
import { Permit2 } from '../../../../typechain'

const { ethers } = hre

const chainId: number = hre.network.config.chainId ? hre.network.config.chainId : 1

export type Permit = {
  token: string
  spender: string
  amount: number | BigNumber
  expiration: number | BigNumber
  nonce: number | BigNumber
  sigDeadline: number | BigNumber
}

export const PERMIT2_PERMIT_TYPE = {
  Permit: [
    { name: 'token', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint64' },
    { name: 'nonce', type: 'uint32' },
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
  permit: Permit,
  signer: SignerWithAddress,
  verifyingContract: string
): Promise<string> {
  const eip712Domain = getEip712Domain(chainId, verifyingContract)
  const signature = await signer._signTypedData(eip712Domain, PERMIT2_PERMIT_TYPE, permit)

  return signature
}

export async function signPermitAndConstructCalldata(
  permit: Permit,
  signer: SignerWithAddress,
  permit2: Permit2
): Promise<string> {
  // look up the correct nonce for this permit
  const nextNonce = (await permit2.allowance(signer.address, permit.token, permit.spender)).nonce
  permit.nonce = nextNonce

  const signature = await signPermit(permit, signer, permit2.address)
  const calldata = PERMIT2_INTERFACE.encodeFunctionData('permit', [ethers.constants.AddressZero, permit, signature])

  // Remove function signature and first parameter (the router fills these in itself)
  return '0x' + calldata.slice(74)
}
