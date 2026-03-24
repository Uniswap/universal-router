import { Interface, LogDescription, TransactionReceipt, id } from 'ethers'

export const V2_EVENTS = new Interface([
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
])

export const V3_EVENTS = new Interface([
  'event Swap( address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
])

export function parseEvents(iface: Interface, receipt: TransactionReceipt): (LogDescription | undefined)[] {
  return receipt.logs
    .map((log: { topics: ReadonlyArray<string>; data: string }) => {
      try {
        return iface.parseLog(log)
      } catch (e) {
        return undefined
      }
    })
    .filter((n: LogDescription | undefined | null) => n)
}

export function findCustomErrorSelector(iface: any, name: string): string | undefined {
  const customErrorEntry = Object.entries(iface.errors).find(([, fragment]: any) => fragment.name === name)

  if (customErrorEntry === undefined) {
    return undefined
  }

  const [customErrorSignature] = customErrorEntry
  const customErrorSelector = id(customErrorSignature).slice(0, 10)

  return customErrorSelector
}
