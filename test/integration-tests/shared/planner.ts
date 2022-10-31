import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum CommandType {
  PERMIT = 0x00,
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
  PAY_PORTION = 0x10,
  SUDOSWAP = 0x12,
  NFT20 = 0x13,
  OWNER_CHECK_721 = 0x14,
  OWNER_CHECK_1155 = 0x15,
  CRYPTOPUNKS = 0x16,
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
  [CommandType.PERMIT]: [],
  [CommandType.TRANSFER]: ['address', 'address', 'uint256'],
  [CommandType.V3_SWAP_EXACT_IN]: ['address', 'uint256', 'uint256', 'bytes'],
  [CommandType.V3_SWAP_EXACT_OUT]: ['address', 'uint256', 'uint256', 'bytes'],
  [CommandType.V2_SWAP_EXACT_IN]: ['uint256', 'address[]', 'address'],
  [CommandType.V2_SWAP_EXACT_OUT]: ['uint256', 'uint256', 'address[]', 'address'],
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
  [CommandType.PAY_PORTION]: ['address', 'address', 'uint256'],
  [CommandType.SUDOSWAP]: ['uint256', 'bytes'],
  [CommandType.OWNER_CHECK_721]: ['address', 'address', 'uint256'],
  [CommandType.OWNER_CHECK_1155]: ['address', 'address', 'uint256', 'uint256'],
  [CommandType.NFT20]: ['uint256', 'bytes'],
  [CommandType.CRYPTOPUNKS]: ['uint256', 'address', 'uint256'],
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
