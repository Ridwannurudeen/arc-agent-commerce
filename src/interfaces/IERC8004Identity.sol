// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IERC8004Identity
/// @notice Interface for ERC-8004 IdentityRegistry on Arc Testnet
/// @dev Deployed at 0x8004A818BFB912233c491871b3d84c89A494BD9e
interface IERC8004Identity {
    function register(string calldata metadataURI) external returns (uint256 tokenId);
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function balanceOf(address owner) external view returns (uint256);
}
