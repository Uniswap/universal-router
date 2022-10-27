import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum CommandType {
  PERMIT2_PERMIT = 0x00,
  PERMIT2_PERMIT_BATCH = 0x14,
  PERMIT2_TRANSFER_FROM = 0x15,
  PERMIT2_TRANSFER_FROM_BATCH = 0x16,
  TRANSFER = 0x01,
  V3_SWAP_EXACT_IN = 0x02,
  V3_SWAP_EXACT_OUT = 0x03,
  V2_SWAP_EXACT_IN = 0x04,
  V2_SWAP_EXACT_OUT = 0x05,
  SEAPORT = 0x06,
  WRAP_ETH = 0x07,
  UNWRAP_WETH = 0x08,
  SWEEP = 0x09,
  NFTX = 0x0a,
  LOOKS_RARE_721 = 0x0b,
  X2Y2_721 = 0x0c,
  LOOKS_RARE_1155 = 0x0d,
  X2Y2_1155 = 0x0e,
  FOUNDATION = 0x0f,
  SWEEP_WITH_FEE = 0x10,
  UNWRAP_WETH_WITH_FEE = 0x11,
  SUDOSWAP = 0x12,
  NFT20 = 0x13,
}

const ALLOW_REVERT_FLAG = 0x80

const REVERTABLE_COMMANDS = new Set<CommandType>([
  CommandType.SEAPORT,
  CommandType.NFTX,
  CommandType.LOOKS_RARE_721,
  CommandType.LOOKS_RARE_1155,
  CommandType.X2Y2_721,
  CommandType.X2Y2_1155,
  CommandType.FOUNDATION,
  CommandType.SUDOSWAP,
  CommandType.NFT20,
])

const ABI_DEFINITION: { [key in CommandType]: string[] } = {
  [CommandType.PERMIT2_PERMIT]: ['bytes'],
  [CommandType.PERMIT2_PERMIT_BATCH]: ['bytes'],
  [CommandType.PERMIT2_TRANSFER_FROM]: ['address', 'address', 'uint160'],
  [CommandType.PERMIT2_TRANSFER_FROM_BATCH]: ['bytes'],
  [CommandType.TRANSFER]: ['address', 'address', 'uint256'],
  [CommandType.V3_SWAP_EXACT_IN]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V3_SWAP_EXACT_OUT]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V2_SWAP_EXACT_IN]: ['uint256', 'address[]', 'address'],
  [CommandType.V2_SWAP_EXACT_OUT]: ['uint256', 'uint256', 'address[]', 'address', 'bool'],
  [CommandType.SEAPORT]: ['uint256', 'bytes'],
  [CommandType.WRAP_ETH]: ['address', 'uint256'],
  [CommandType.UNWRAP_WETH]: ['address', 'uint256'],
  [CommandType.SWEEP]: ['address', 'address', 'uint256'],
  [CommandType.NFTX]: ['uint256', 'bytes'],
  [CommandType.LOOKS_RARE_721]: ['uint256', 'bytes', 'address', 'address', 'uint256'],
  [CommandType.X2Y2_721]: ['uint256', 'bytes', 'address', 'address', 'uint256'],
  [CommandType.LOOKS_RARE_1155]: ['uint256', 'bytes', 'address', 'address', 'uint256', 'uint256'],
  [CommandType.X2Y2_1155]: ['uint256', 'bytes', 'address', 'address', 'uint256', 'uint256'],
  [CommandType.FOUNDATION]: ['uint256', 'bytes', 'address', 'address', 'uint256'],
  [CommandType.SWEEP_WITH_FEE]: ['address', 'address', 'uint256', 'uint256', 'address'],
  [CommandType.UNWRAP_WETH_WITH_FEE]: ['address', 'uint256', 'uint256', 'address'],
  [CommandType.SUDOSWAP]: ['uint256', 'bytes'],
  [CommandType.NFT20]: ['uint256', 'bytes'],
}

export class RoutePlanner {
  commands: string
  inputs: string[]

  constructor() {
    this.commands = '0x'
    this.inputs = []
  }

  addCommand(type: CommandType, parameters: any[], allowRevert = false): void {
    let command = createCommand(type, parameters)
    this.inputs.push(command.encodedInput)
    if (allowRevert) {
      if (!REVERTABLE_COMMANDS.has(command.type)) {
        throw new Error(`command type: ${command.type} cannot be allowed to revert`)
      }
      command.type = command.type | ALLOW_REVERT_FLAG
    }

    this.commands = this.commands.concat(command.type.toString(16).padStart(2, '0'))
  }
}

export type RouterCommand = {
  type: CommandType
  encodedInput: string
}

export function createCommand(type: CommandType, parameters: any[]): RouterCommand {
  const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[type], parameters)
  return { type, encodedInput }
}
