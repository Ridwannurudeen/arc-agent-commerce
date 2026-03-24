// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title MockIdentityRegistry — minimal ERC-8004 IdentityRegistry mock
contract MockIdentityRegistry {
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public owners;
    mapping(uint256 => string) public uris;
    mapping(address => uint256) public balances;

    function register(string calldata metadataURI) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        owners[tokenId] = msg.sender;
        uris[tokenId] = metadataURI;
        balances[msg.sender]++;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return uris[tokenId];
    }

    function balanceOf(address owner) external view returns (uint256) {
        return balances[owner];
    }
}
