// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// agregar mapping de minters...
contract CrateGameItems is ERC1155, Ownable {
    using EnumerableSet for EnumerableSet.UintSet;

    address public minter;
    mapping(address => EnumerableSet.UintSet) private _ownedIds;

    constructor(address minter_) ERC1155("") Ownable(msg.sender) {
        minter = minter_;
    }

    function mint(address to, uint256 id, uint256 amount) external {
        require(msg.sender == minter, "not minter");
        _mint(to, id, amount, "");
    }

    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts) external {
        require(msg.sender == minter, "not minter");
        _mintBatch(to, ids, amounts, "");
    }

    function ownerMint(address to, uint256 id, uint256 amount) external onlyOwner {
        _mint(to, id, amount, "");
    }

    function setMinter(address minter_) external onlyOwner {    
        minter = minter_;
    }

    function setURI(string calldata newURI) external onlyOwner {
        _setURI(newURI);
    }

    function burnBatchFrom(address from, uint256[] calldata ids, uint256[] calldata amounts) external {
        require(from == msg.sender || isApprovedForAll(from, msg.sender), "not approved to burn");
        _burnBatch(from, ids, amounts);
    }

    function ownedIds(address user) external view returns (uint256[] memory ids) {
        uint256 length = _ownedIds[user].length();
        ids = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            ids[i] = _ownedIds[user].at(i);
        }
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        super._update(from, to, ids, values);

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];

            if (from != address(0) && balanceOf(from, id) == 0) {
                _ownedIds[from].remove(id);
            }

            if (to != address(0) && balanceOf(to, id) > 0) {
                _ownedIds[to].add(id);
            }
        }
    }
}
