import hre from 'hardhat';
const { ethers } = hre;

const posmABI = require('../../../lib/v4-periphery/foundry-out/PositionManager.sol/PositionManager.json').abi;
const posmBytecode = require('../../../lib/v4-periphery/foundry-out/PositionManager.sol/PositionManager.json').bytecode;

const poolABI = require('../../../lib/v4-periphery/lib/v4-core/out/PoolManager.sol/PoolManager.json').abi;
const poolBytecode = require('../../../lib/v4-periphery/lib/v4-core/out/PoolManager.sol/PoolManager.json').bytecode;

export async function deployV4PositionManager() {

    const [deployer] = await ethers.getSigners();
    const factory = new ethers.ContractFactory(posmABI, posmBytecode, deployer);
    const contract = await factory.deploy(await deployV4PoolManager());
    return contract.address;
}

export async function deployV4PoolManager() {
    
    const [deployer] = await ethers.getSigners();
    const factory = new ethers.ContractFactory(poolABI, poolBytecode, deployer);
    const contract = await factory.deploy(500000);
    return contract.address;
    
}
