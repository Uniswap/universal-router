import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum Actions {
  // pool actions
  // liquidity actions
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,
  // swapping
  SWAP_EXACT_IN_SINGLE = 0x04,
  SWAP_EXACT_IN = 0x05,
  SWAP_EXACT_OUT_SINGLE = 0x06,
  SWAP_EXACT_OUT = 0x07,
  // donate
  // DONATE = 0x08,

  // closing deltas on the pool manager
  // settling
  // SETTLE = 0x10,
  SETTLE_ALL = 0x11,
  SETTLE_WITH_BALANCE = 0x12,
  // taking
  // TAKE = 0x13,
  TAKE_ALL = 0x14,
  // TAKE_PORTION = 0x15,

  CLOSE_CURRENCY = 0x16,
  // CLOSE_PAIR = 0x17,
  // CLEAR = 0x18,
  SWEEP = 0x19,

  // minting/burning 6909s to close deltas
  // MINT_6909 = 0x20,
  // BURN_6909 = 0x21,
}

const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

const PATH_KEY_STRUCT = '(address intermediateCurrency,uint256 fee,int24 tickSpacing,address hooks,bytes hookData)'

const POSITION_CONFIG_STRUCT = '(' + POOL_KEY_STRUCT + ' poolKey,int24 tickLower,int24 tickUpper)'

const SWAP_EXACT_IN_SINGLE_STRUCT =
  '(' +
  POOL_KEY_STRUCT +
  ' poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint160 sqrtPriceLimitX96,bytes hookData)'

const SWAP_EXACT_IN_STRUCT =
  '(address currencyIn,' + PATH_KEY_STRUCT + '[] path,uint128 amountIn,uint128 amountOutMinimum)'

const SWAP_EXACT_OUT_SINGLE_STRUCT =
  '(' +
  POOL_KEY_STRUCT +
  ' poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,uint160 sqrtPriceLimitX96,bytes hookData)'

const SWAP_EXACT_OUT_STRUCT =
  '(address currencyOut,' + PATH_KEY_STRUCT + '[] path,uint128 amountOut,uint128 amountInMaximum)'

const ABI_DEFINITION: { [key in Actions]: string[] } = {
  // Liquidity commands
  [Actions.INCREASE_LIQUIDITY]: ['uint256', POSITION_CONFIG_STRUCT, 'uint256', 'bytes'],
  [Actions.DECREASE_LIQUIDITY]: ['uint256', POSITION_CONFIG_STRUCT, 'uint256', 'bytes'],
  [Actions.MINT_POSITION]: [POSITION_CONFIG_STRUCT, 'uint256', 'address', 'bytes'],
  [Actions.BURN_POSITION]: ['uint256', POSITION_CONFIG_STRUCT, 'bytes'],

  // Swapping commands
  [Actions.SWAP_EXACT_IN_SINGLE]: [SWAP_EXACT_IN_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_IN]: [SWAP_EXACT_IN_STRUCT],
  [Actions.SWAP_EXACT_OUT_SINGLE]: [SWAP_EXACT_OUT_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_OUT]: [SWAP_EXACT_OUT_STRUCT],

  // Payments commands
  [Actions.SETTLE_ALL]: ['address'],
  [Actions.SETTLE_WITH_BALANCE]: ['address'],
  [Actions.TAKE_ALL]: ['address', 'address'],
  [Actions.CLOSE_CURRENCY]: ['address'],
  [Actions.SWEEP]: ['address', 'address'],
}

export class RoutePlanner {
  actions: string
  params: string[]

  constructor() {
    this.actions = '0x'
    this.params = []
  }

  addCommand(type: Actions, parameters: any[]): void {
    let command = createCommand(type, parameters)
    this.params.push(command.encodedInput)
    this.actions = this.actions.concat(command.action.toString(16).padStart(2, '0'))
  }
}

export type ActionsRouterCommand = {
  action: Actions
  encodedInput: string
}

export function createCommand(action: Actions, parameters: any[]): ActionsRouterCommand {
  const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[action], parameters)
  return { action, encodedInput }
}
