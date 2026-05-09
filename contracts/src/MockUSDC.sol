// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice ERC-20 con 6 decimales para simular USDC en demos sobre Base Sepolia.
///         Cualquiera puede mint para facilitar escenarios del hackathon.
contract MockUSDC is ERC20 {
    constructor(address mintTo) ERC20("Mock USDC", "USDC") {
        _mint(mintTo, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint open para que el demo pueda recargar saldos sin redeploy.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
