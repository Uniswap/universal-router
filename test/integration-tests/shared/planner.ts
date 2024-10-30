import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum CommandType {
  V3_SWAP_EXACT_IN = 0x00,
  V3_SWAP_EXACT_OUT = 0x01,
  PERMIT2_TRANSFER_FROM = 0x02,
  PERMIT2_PERMIT_BATCH = 0x03,
  SWEEP = 0x04,
  TRANSFER = 0x05,
  PAY_PORTION = 0x06,

  V2_SWAP_EXACT_IN = 0x08,
  V2_SWAP_EXACT_OUT = 0x09,
  PERMIT2_PERMIT = 0x0a,
  WRAP_ETH = 0x0b,
  UNWRAP_WETH = 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH = 0x0d,
  BALANCE_CHECK_ERC20 = 0x0e,

  V4_SWAP = 0x10,
  V3_POSITION_MANAGER_PERMIT = 0x11,
  V3_POSITION_MANAGER_CALL = 0x12,
  V4_INITIALIZE_POOL = 0x13,
  V4_POSITION_MANAGER_CALL = 0x14,

  EXECUTE_SUB_PLAN = 0x21,
}

const ALLOW_REVERT_FLAG = 0x80

const REVERTIBLE_COMMANDS = new Set<CommandType>([
  CommandType.EXECUTE_SUB_PLAN,
  CommandType.PERMIT2_PERMIT,
  CommandType.PERMIT2_PERMIT_BATCH,
])

const PERMIT_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce) details, address spender, uint256 sigDeadline)'

const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

const PERMIT_BATCH_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce)[] details, address spender, uint256 sigDeadline)'

const PERMIT2_TRANSFER_FROM_STRUCT = '(address from,address to,uint160 amount,address token)'
const PERMIT2_TRANSFER_FROM_BATCH_STRUCT = PERMIT2_TRANSFER_FROM_STRUCT + '[]'

const ABI_DEFINITION: { [key in CommandType]: string[] } = {
  // Batch Reverts
  [CommandType.EXECUTE_SUB_PLAN]: ['bytes', 'bytes[]'],

  // Permit2 Actions
  [CommandType.PERMIT2_PERMIT]: [PERMIT_STRUCT, 'bytes'],
  [CommandType.PERMIT2_PERMIT_BATCH]: [PERMIT_BATCH_STRUCT, 'bytes'],
  [CommandType.PERMIT2_TRANSFER_FROM]: ['address', 'address', 'uint160'],
  [CommandType.PERMIT2_TRANSFER_FROM_BATCH]: [PERMIT2_TRANSFER_FROM_BATCH_STRUCT],

  // Uniswap Actions
  [CommandType.V3_SWAP_EXACT_IN]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V3_SWAP_EXACT_OUT]: ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  [CommandType.V2_SWAP_EXACT_IN]: ['address', 'uint256', 'uint256', 'address[]', 'bool'],
  [CommandType.V2_SWAP_EXACT_OUT]: ['address', 'uint256', 'uint256', 'address[]', 'bool'],

  // Token Actions and Checks
  [CommandType.WRAP_ETH]: ['address', 'uint256'],
  [CommandType.UNWRAP_WETH]: ['address', 'uint256'],
  [CommandType.SWEEP]: ['address', 'address', 'uint256'],
  [CommandType.TRANSFER]: ['address', 'address', 'uint256'],
  [CommandType.PAY_PORTION]: ['address', 'address', 'uint256'],
  [CommandType.BALANCE_CHECK_ERC20]: ['address', 'address', 'uint256'],

  [CommandType.V4_SWAP]: ['bytes', 'bytes[]'],
  [CommandType.V3_POSITION_MANAGER_PERMIT]: ['bytes'],
  [CommandType.V3_POSITION_MANAGER_CALL]: ['bytes'],
  [CommandType.V4_INITIALIZE_POOL]: [POOL_KEY_STRUCT, 'uint160'],
  [CommandType.V4_POSITION_MANAGER_CALL]: ['bytes'],
}

export class RoutePlanner {
  commands: string
  inputs: string[]

  constructor() {
    this.commands = '0x'
    this.inputs = []
  }

  addSubPlan(subplan: RoutePlanner): void {
    this.addCommand(CommandType.EXECUTE_SUB_PLAN, [subplan.commands, subplan.inputs], true)
  }

  addCommand(type: CommandType, parameters: any[], allowRevert = false): void {
    let command = createCommand(type, parameters)
    this.inputs.push(command.encodedInput)
    if (allowRevert) {
      if (!REVERTIBLE_COMMANDS.has(command.type)) {
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
  if (
    type === CommandType.V3_POSITION_MANAGER_CALL ||
    type === CommandType.V3_POSITION_MANAGER_PERMIT ||
    type === CommandType.V4_POSITION_MANAGER_CALL
  ) {
    return { type, encodedInput: parameters[0] }
  } else {
    const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[type], parameters)
    return { type, encodedInput }
  }
}
