import bn from 'bignumber.js'

export function expandTo18DecimalsBN(n: number): bigint {
  // use bn intermediately to allow decimals in intermediate calculations
  return BigInt(new bn(n).times(new bn(10).pow(18)).toFixed())
}

export function expandTo6DecimalsBN(n: number): bigint {
  // use bn intermediately to allow decimals in intermediate calculations
  return BigInt(new bn(n).times(new bn(10).pow(6)).toFixed())
}
