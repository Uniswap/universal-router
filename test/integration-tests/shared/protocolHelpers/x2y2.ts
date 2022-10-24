import { BigNumber } from 'ethers'
import X2Y2_ABI from './../../shared/abis/X2Y2.json'
import fs from 'fs'
import hre from 'hardhat'
const { ethers } = hre

export const X2Y2_INTERFACE = new ethers.utils.Interface(X2Y2_ABI)
export const x2y2Orders = JSON.parse(
  fs.readFileSync('test/integration-tests/shared/orders/X2Y2.json', { encoding: 'utf8' })
)

export type X2Y2Order = {
  input: string
  order_id: number
  token_id: BigNumber
  price: BigNumber
}
