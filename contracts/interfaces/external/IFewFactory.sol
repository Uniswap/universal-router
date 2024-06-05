// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

interface IFewFactory {
    event WrappedTokenCreated(address indexed originalToken, address wrappedToken, uint);

    function getWrappedToken(address originalToken) external view returns (address wrappedToken);
    function allWrappedTokens(uint) external view returns (address wrappedToken);
    function parameter() external view returns (address);
    function allWrappedTokensLength() external view returns (uint);
    function paused() external view returns (bool);
    function createToken(address originalToken) external returns (address wrappedToken);
}
