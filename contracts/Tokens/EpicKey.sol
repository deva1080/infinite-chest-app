// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract EpicKey is ERC20, Ownable {
    constructor(address owner_, uint256 initialSupply) ERC20("Epic Key", "EKEY") Ownable(owner_) {
        _mint(owner_, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
