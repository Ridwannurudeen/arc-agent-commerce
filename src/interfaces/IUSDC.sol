// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IUSDC
/// @notice Interface for USDC ERC-20 on Arc
/// @dev Deployed at 0x3600000000000000000000000000000000000000 (6 decimals)
interface IUSDC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
