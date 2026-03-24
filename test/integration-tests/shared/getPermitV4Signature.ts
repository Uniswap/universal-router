import { BigNumberish, MaxUint256, Signature, ethers } from 'ethers'
import { PositionManager } from '../../../typechain'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'

export default async function getPermitV4Signature(
  wallet: SignerWithAddress,
  positionManager: PositionManager,
  spender: string,
  tokenId: BigNumberish,
  deadline: BigNumberish = MaxUint256,
  permitConfig?: { nonce?: BigNumberish; name?: string; chainId?: number; version?: string }
): Promise<Signature> {
  const [nonce, name, chainId] = await Promise.all([
    permitConfig?.nonce ?? 0,
    permitConfig?.name ?? positionManager.name(),
    permitConfig?.chainId ?? wallet.provider!.getNetwork().then((n) => Number(n.chainId)),
  ])

  return ethers.Signature.from(
    await wallet.signTypedData(
      {
        name,
        chainId,
        verifyingContract: await positionManager.getAddress(),
      },
      {
        Permit: [
          {
            name: 'spender',
            type: 'address',
          },
          {
            name: 'tokenId',
            type: 'uint256',
          },
          {
            name: 'nonce',
            type: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint256',
          },
        ],
      },
      {
        owner: wallet.address,
        spender,
        tokenId,
        nonce,
        deadline,
      }
    )
  )
}
