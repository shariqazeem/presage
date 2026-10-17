// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TESTNET ONLY. A worthless 6-decimal dollar that anyone can mint, standing in for m.USDC on
/// Metis Sepolia. It is never deployed to Andromeda.
contract TestDollar is ERC20 {
    constructor() ERC20("Called Test Dollar (worthless)", "tUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(amount <= 1_000e6, "max 1000 per mint");
        _mint(to, amount);
    }
}
