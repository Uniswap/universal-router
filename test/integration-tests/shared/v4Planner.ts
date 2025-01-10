import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * Actions
 * @description Constants that define what action to perform
 * @enum {number}
 */
export enum Actions {
  // pool actions
  // liquidity actions
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,
  INCREASE_LIQUIDITY_FROM_DELTAS = 0x04,
  MINT_POSITION_FROM_DELTAS = 0x05,

  // swapping
  SWAP_EXACT_IN_SINGLE = 0x06,
  SWAP_EXACT_IN = 0x07,
  SWAP_EXACT_OUT_SINGLE = 0x08,
  SWAP_EXACT_OUT = 0x09,
  // donate
  // DONATE = 0x0a,

  // closing deltas on the pool manager
  // settling
  SETTLE = 0x0b,
  SETTLE_ALL = 0x0c,
  // SETTLE_PAIR = 0x0d,
  // taking
  TAKE = 0x0e,
  TAKE_ALL = 0x0f,
  TAKE_PORTION = 0x10,
  // TAKE_PAIR = 0x11,

  CLOSE_CURRENCY = 0x12,
  // CLEAR_OR_TAKE = 0x13,
  SWEEP = 0x14,

  WRAP = 0x15,
  UNWRAP = 0x16,

  // minting/burning 6909s to close deltas
  // MINT_6909 = 0x17,
  // BURN_6909 = 0x18,
}

const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

const PATH_KEY_STRUCT = '(address intermediateCurrency,uint256 fee,int24 tickSpacing,address hooks,bytes hookData)'

const SWAP_EXACT_IN_SINGLE_STRUCT =
  '(' + POOL_KEY_STRUCT + ' poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'

const SWAP_EXACT_IN_STRUCT =
  '(address currencyIn,' + PATH_KEY_STRUCT + '[] path,uint128 amountIn,uint128 amountOutMinimum)'

const SWAP_EXACT_OUT_SINGLE_STRUCT =
  '(' + POOL_KEY_STRUCT + ' poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,bytes hookData)'

const SWAP_EXACT_OUT_STRUCT =
  '(address currencyOut,' + PATH_KEY_STRUCT + '[] path,uint128 amountOut,uint128 amountInMaximum)'

const ABI_DEFINITION: { [key in Actions]: string[] } = {
  // Liquidity commands
  [Actions.INCREASE_LIQUIDITY]: ['uint256', 'uint256', 'uint128', 'uint128', 'bytes'],
  [Actions.DECREASE_LIQUIDITY]: ['uint256', 'uint256', 'uint128', 'uint128', 'bytes'],
  [Actions.MINT_POSITION]: [POOL_KEY_STRUCT, 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'],
  [Actions.BURN_POSITION]: ['uint256', 'uint128', 'uint128', 'bytes'],
  [Actions.INCREASE_LIQUIDITY_FROM_DELTAS]: ['uint256', 'uint128', 'uint128', 'bytes'],
  [Actions.MINT_POSITION_FROM_DELTAS]: [POOL_KEY_STRUCT, 'int24', 'int24', 'uint128', 'uint128', 'address', 'bytes'],

  // Swapping commands
  [Actions.SWAP_EXACT_IN_SINGLE]: [SWAP_EXACT_IN_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_IN]: [SWAP_EXACT_IN_STRUCT],
  [Actions.SWAP_EXACT_OUT_SINGLE]: [SWAP_EXACT_OUT_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_OUT]: [SWAP_EXACT_OUT_STRUCT],

  // Payments commands
  [Actions.SETTLE]: ['address', 'uint256', 'bool'],
  [Actions.SETTLE_ALL]: ['address', 'uint256'],
  [Actions.TAKE]: ['address', 'address', 'uint256'],
  [Actions.TAKE_ALL]: ['address', 'uint256'],
  [Actions.TAKE_PORTION]: ['address', 'address', 'uint256'],

  [Actions.CLOSE_CURRENCY]: ['address'],
  [Actions.SWEEP]: ['address', 'address'],

  [Actions.WRAP]: ['uint256'],
  [Actions.UNWRAP]: ['uint256'],
}

export class V4Planner {
  actions: string
  params: string[]

  constructor() {
    this.actions = '0x'
    this.params = []
  }

  addAction(type: Actions, parameters: any[]): void {
    let command = createAction(type, parameters)
    this.params.push(command.encodedInput)
    this.actions = this.actions.concat(command.action.toString(16).padStart(2, '0'))
  }

  finalize(): string {
    return defaultAbiCoder.encode(['bytes', 'bytes[]'], [this.actions, this.params])
  }
}

export type RouterAction = {
  action: Actions
  encodedInput: string
}

export function createAction(action: Actions, parameters: any[]): RouterAction {
  const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[action], parameters)
  return { action, encodedInput }
}
