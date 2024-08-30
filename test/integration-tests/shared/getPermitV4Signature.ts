import { BigNumberish, constants, Signature } from 'ethers'
import { splitSignature } from 'ethers/lib/utils'
import { PositionManager } from '../../../typechain'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

export default async function getPermitV4Signature(
  wallet: SignerWithAddress,
  positionManager: PositionManager,
  spender: string,
  tokenId: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256,
  permitConfig?: { nonce?: BigNumberish; name?: string; chainId?: number; version?: string }
): Promise<Signature> {
  const [nonce, name, chainId] = await Promise.all([
    permitConfig?.nonce ?? 0,
    permitConfig?.name ?? positionManager.name(),
    permitConfig?.chainId ?? wallet.getChainId(),
  ])

  return splitSignature(
    await wallet._signTypedData(
      {
        name,
        chainId,
        verifyingContract: positionManager.address,
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
