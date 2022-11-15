import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum CommandType {
  V3_SWAP_EXACT_IN = 0x00,
  V2_SWAP_EXACT_IN = 0x01,
  V3_SWAP_EXACT_OUT = 0x02,
  V2_SWAP_EXACT_OUT = 0x03,
  PERMIT2_TRANSFER_FROM = 0x04,
  PERMIT2_PERMIT = 0x05,
  PERMIT2_PERMIT_BATCH = 0x06,
  TRANSFER = 0x07,
  WRAP_ETH = 0x08,
  UNWRAP_WETH = 0x09,
  PAY_PORTION = 0x0a,
  SWEEP_ERC721 = 0x0b,
  SWEEP_ERC1155 = 0x0c,

  // NFT-related command types
  SEAPORT = 0x10,
  X2Y2_721 = 0x11,
  LOOKS_RARE_721 = 0x12,
  SUDOSWAP = 0x13,
  NFTX = 0x14,
  NFT20 = 0x15,
  CRYPTOPUNKS = 0x16,
  X2Y2_1155 = 0x17,
  LOOKS_RARE_1155 = 0x18,
  FOUNDATION = 0x19,
  SWEEP = 0x1a,
  OWNER_CHECK_721 = 0x1b,
  OWNER_CHECK_1155 = 0x1c,
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

const PERMIT_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce) details, address spender, uint256 sigDeadline)'

const PERMIT_BATCH_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce)[] details, address spender, uint256 sigDeadline)'

const ABI_DEFINITION: { [key in CommandType]: any } = {
  [CommandType.PERMIT2_PERMIT]: [PERMIT_STRUCT, 'bytes'],
  [CommandType.PERMIT2_PERMIT_BATCH]: [PERMIT_BATCH_STRUCT, 'bytes'],
  [CommandType.PERMIT2_TRANSFER_FROM]: ['address', 'address', 'uint160'],
  [CommandType.TRANSFER]: ['address', 'address', 'uint256'],
  [CommandType.V3_SWAP_EXACT_IN]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V3_SWAP_EXACT_OUT]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V2_SWAP_EXACT_IN]: ['uint256', 'uint256', 'address[]', 'address', 'bool'],
  [CommandType.V2_SWAP_EXACT_OUT]: ['uint256', 'uint256', 'address[]', 'address', 'bool'],
  [CommandType.SEAPORT]: ['uint256', 'bytes'],
  [CommandType.WRAP_ETH]: ['address', 'uint256'],
  [CommandType.UNWRAP_WETH]: ['address', 'uint256'],
  [CommandType.SWEEP]: ['address', 'address', 'uint256'],
  [CommandType.SWEEP_ERC721]: ['address', 'address', 'uint256'],
  [CommandType.SWEEP_ERC1155]: ['address', 'address', 'uint256', 'uint256'],
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
