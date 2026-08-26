// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockFoTToken
/// @notice Minimal ERC20 with a configurable transfer fee (basis points). Used by the
///         V2-aggregator FoT tests to construct a real Uniswap V2 pair with fee-on-transfer
///         behavior, then exercise the aggregator hook's `amountArrived` accounting.
contract MockFoTToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint16 public immutable feeBps; // 10_000 = 100%; e.g. 200 = 2%

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint16 _feeBps) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        balanceOf[from] -= amount;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 received = amount - fee;
        unchecked {
            balanceOf[to] += received;
            // Fee is burned (simplest model). A real FoT token might send it to a treasury.
            totalSupply -= fee;
        }
        emit Transfer(from, to, amount);
        return true;
    }
}
