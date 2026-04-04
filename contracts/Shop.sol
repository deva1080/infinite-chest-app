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
    event TreasurySet(address indexed previousTreasury, address indexed newTreasury);
    event KeyTokenSet(address indexed previousKeyToken, address indexed newKeyToken);
    event ItemsContractSet(address indexed previousItemsContract, address indexed newItemsContract);
    event ShopConfigCreated(uint32 indexed configId, uint256 chestPrice);
    event ShopConfigUpdated(uint32 indexed configId, uint256 chestPrice);
    event Sold(address indexed user, uint32 indexed configId, uint256 tokenId, uint256 amount, uint256 totalPrice);
    event BatchSold(address indexed user, uint256 totalItems, uint256 totalPrice);
    event AutoSoldFromChest(
        address indexed user,
        uint32 indexed configId,
        uint256 totalItems,
        uint256 totalPrice
    );
    event NFTWithdrawn(address indexed to, uint256 indexed tokenId, uint256 amount);

    constructor(address treasury_, address keyToken_, address itemsContract_, address infiniteChest_) Ownable(msg.sender) {
        treasury = treasury_;
        keyToken = keyToken_;
        itemsContract = itemsContract_;
        infiniteChest = infiniteChest_;
    }

    modifier onlyInfiniteChest() {
        require(msg.sender == infiniteChest, "Shop: not infiniteChest");
        _;
    }

    function setInfiniteChest(address infiniteChest_) onlyOwner external {
        require(infiniteChest_ != address(0), "Shop: invalid infiniteChest");
        infiniteChest = infiniteChest_;
        emit InfiniteChestSet(infiniteChest_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Shop: invalid treasury");
        address previousTreasury = treasury;
        treasury = treasury_;
        emit TreasurySet(previousTreasury, treasury_);
    }

    function setKeyToken(address keyToken_) external onlyOwner {
        require(keyToken_ != address(0), "Shop: invalid key token");
        address previousKeyToken = keyToken;
        keyToken = keyToken_;
        emit KeyTokenSet(previousKeyToken, keyToken_);
    }

    function setItemsContract(address itemsContract_) external onlyOwner {
        require(itemsContract_ != address(0), "Shop: invalid items contract");
        address previousItemsContract = itemsContract;
        itemsContract = itemsContract_;
        emit ItemsContractSet(previousItemsContract, itemsContract_);
    }

    function createConfigFromChest(
        uint32 configId,
        uint256[] calldata tokenIds,
        uint64[] calldata multipliers,
        uint256 chestPrice
    ) external onlyInfiniteChest {
        require(!_configs[configId].exists, "Shop: config exists");
        require(tokenIds.length > 0, "Shop: empty config");
        require(tokenIds.length == multipliers.length, "Shop: length mismatch");

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

    /// @notice Updates pricing for an existing config.
    /// @dev Clears tokenPrice for IDs removed from the config.
    function updateConfigFromChest(
        uint32 configId,
        uint256[] calldata tokenIds,
        uint64[] calldata multipliers,
        uint256 chestPrice
    ) external onlyInfiniteChest {
        ShopConfig storage config = _configs[configId];
        require(config.exists, "Shop: config not found");
        require(tokenIds.length > 0, "Shop: empty config");
        require(tokenIds.length == multipliers.length, "Shop: length mismatch");

        for (uint256 i = 0; i < config.tokenIds.length; i++) {
            uint256 oldId = config.tokenIds[i];
            bool stillPresent;
            for (uint256 j = 0; j < tokenIds.length; j++) {
                if (tokenIds[j] == oldId) {
                    stillPresent = true;
                    break;
                }
            }
            if (!stillPresent) {
                tokenPrice[oldId] = 0;
            }
        }

        uint256[] memory prices = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            prices[i] = (chestPrice * multipliers[i]) / BP_VALUE;
            tokenPrice[tokenIds[i]] = prices[i];
        }

        config.chestPrice = chestPrice;
        config.tokenIds = tokenIds;
        config.prices = prices;

        emit ShopConfigUpdated(configId, chestPrice);
    }


    function sell(uint32 configId, uint256 tokenId, uint256 amount) external {
        ShopConfig storage config = _configs[configId];
        require(config.exists, "Shop: config not found");

        uint256 pricePerItem = tokenPrice[tokenId];
        require(pricePerItem > 0, "Shop: token price not found");

        IERC1155(itemsContract).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        uint256 totalPrice = pricePerItem * amount;
        ITreasury(treasury).withdraw(keyToken, msg.sender, totalPrice);

        emit Sold(msg.sender, configId, tokenId, amount, totalPrice);
    }

    function batchSell(uint256[] calldata tokenIds, uint256[] calldata amounts) external {
        require(tokenIds.length > 0, "Shop: empty batch");
        require(tokenIds.length == amounts.length, "Shop: length mismatch");

        uint256 totalPrice;
        uint256 totalItems;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 amount = amounts[i];
            require(amount > 0, "Shop: zero amount");

            uint256 pricePerItem = tokenPrice[tokenIds[i]];
            require(pricePerItem > 0, "Shop: token price not found");

            totalPrice += pricePerItem * amount;
            totalItems += amount;
        }

        IERC1155(itemsContract).safeBatchTransferFrom(msg.sender, address(this), tokenIds, amounts, "");
        ITreasury(treasury).withdraw(keyToken, msg.sender, totalPrice);

        emit BatchSold(msg.sender, totalItems, totalPrice);
    }

    function autoSellFromChest(
        uint32 configId,
        address user,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external onlyInfiniteChest returns (uint256 totalPrice) {
        require(user != address(0), "Shop: invalid user");
        require(tokenIds.length > 0, "Shop: empty batch");
        require(tokenIds.length == amounts.length, "Shop: length mismatch");
        require(_configs[configId].exists, "Shop: config not found");

        uint256 totalItems;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 amount = amounts[i];
            require(amount > 0, "Shop: zero amount");

            uint256 pricePerItem = tokenPrice[tokenIds[i]];
            require(pricePerItem > 0, "Shop: token price not found");

            totalPrice += pricePerItem * amount;
            totalItems += amount;
        }

        ITreasury(treasury).withdraw(keyToken, user, totalPrice);
        emit AutoSoldFromChest(user, configId, totalItems, totalPrice);
    }

    function getConfig(uint32 configId) external view returns (ShopConfig memory) {
        return _configs[configId];
    }

    function withdrawNFT(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        IERC1155(itemsContract).safeTransferFrom(address(this), to, tokenId, amount, "");
        emit NFTWithdrawn(to, tokenId, amount);
    }
}
