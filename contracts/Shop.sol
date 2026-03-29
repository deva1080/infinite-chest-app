// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

interface ITreasury {
    function withdraw(address token, address to, uint256 amount) external;
}

contract Shop is ERC1155Holder, Ownable {
    uint256 internal constant BP_VALUE = 10_000;

    struct ShopConfig {
        uint256 chestPrice;
        uint256[] tokenIds;
        uint256[] prices;
        bool exists;
    }

    address public treasury;
    address public keyToken;
    address public itemsContract;
    address public infiniteChest;

    mapping(uint32 => ShopConfig) private _configs;
    mapping(uint256 => uint256) public tokenPrice;

    event InfiniteChestSet(address indexed infiniteChest);
    event ShopConfigCreated(uint32 indexed configId, uint256 chestPrice);
    event Sold(address indexed user, uint32 indexed configId, uint256 tokenId, uint256 amount, uint256 totalPrice);
    event BatchSold(address indexed user, uint256 totalItems, uint256 totalPrice);
    event NFTWithdrawn(address indexed to, uint256 indexed tokenId, uint256 amount);

    constructor(address treasury_, address keyToken_, address itemsContract_, address infiniteChest_) Ownable(msg.sender) {
        treasury = treasury_;
        keyToken = keyToken_;
        itemsContract = itemsContract_;
        infiniteChest = infiniteChest_;
    }

    modifier onlyInfiniteChest() {
        require(msg.sender == infiniteChest, "not infiniteChest");
        _;
    }

    function setInfiniteChest(address infiniteChest_) external {
        require(infiniteChest == address(0), "infiniteChest already set");
        infiniteChest = infiniteChest_;
        emit InfiniteChestSet(infiniteChest_);
    }

    function createConfigFromChest(
        uint32 configId,
        uint256[] calldata tokenIds,
        uint64[] calldata multipliers,
        uint256 chestPrice
    ) external onlyInfiniteChest {
        require(!_configs[configId].exists, "config exists");
        require(tokenIds.length > 0, "empty config");
        require(tokenIds.length == multipliers.length, "length mismatch");

        uint256[] memory prices = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            prices[i] = (chestPrice * multipliers[i]) / BP_VALUE;
            tokenPrice[tokenIds[i]] = prices[i];
        }

        ShopConfig storage config = _configs[configId];
        config.chestPrice = chestPrice;
        config.tokenIds = tokenIds;
        config.prices = prices;
        config.exists = true;

        emit ShopConfigCreated(configId, chestPrice);
    }


    function sell(uint32 configId, uint256 tokenId, uint256 amount) external {
        ShopConfig storage config = _configs[configId];
        require(config.exists, "config not found");

        uint256 pricePerItem = tokenPrice[tokenId];
        require(pricePerItem > 0, "token price not found");

        IERC1155(itemsContract).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        uint256 totalPrice = pricePerItem * amount;
        ITreasury(treasury).withdraw(keyToken, msg.sender, totalPrice);

        emit Sold(msg.sender, configId, tokenId, amount, totalPrice);
    }

    function batchSell(uint256[] calldata tokenIds, uint256[] calldata amounts) external {
        require(tokenIds.length > 0, "empty batch");
        require(tokenIds.length == amounts.length, "length mismatch");

        uint256 totalPrice;
        uint256 totalItems;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 amount = amounts[i];
            require(amount > 0, "zero amount");

            uint256 pricePerItem = tokenPrice[tokenIds[i]];
            require(pricePerItem > 0, "token price not found");

            totalPrice += pricePerItem * amount;
            totalItems += amount;
        }

        IERC1155(itemsContract).safeBatchTransferFrom(msg.sender, address(this), tokenIds, amounts, "");
        ITreasury(treasury).withdraw(keyToken, msg.sender, totalPrice);

        emit BatchSold(msg.sender, totalItems, totalPrice);
    }

    function getConfig(uint32 configId) external view returns (ShopConfig memory) {
        return _configs[configId];
    }

    function withdrawNFT(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        IERC1155(itemsContract).safeTransferFrom(address(this), to, tokenId, amount, "");
        emit NFTWithdrawn(to, tokenId, amount);
    }
}
