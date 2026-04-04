// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IInfiniteChestConfigReader {
    struct ChestConfig {
        address token;
        uint256 price;
        uint72[] weightRanges;
        uint64[] multipliers;
        uint256[] tokenIds;
    }

    function getConfig(uint32 configId) external view returns (ChestConfig memory);
}

interface IShopPriceReader {
    function tokenPrice(uint256 tokenId) external view returns (uint256);
}

interface ITreasuryPayout {
    function withdraw(address token, address to, uint256 amount) external;
}

interface IERC1155BurnableItems {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function burnBatchFrom(address from, uint256[] calldata ids, uint256[] calldata amounts) external;
}

contract BurnCollectionVault is Ownable {
    uint16 internal constant BP_VALUE = 10_000;

    struct DropPosition {
        address user;
        uint32 configId;
        uint64 startDay;
        uint64 endDay;
        uint64 lastClaimDay;
        uint256 dailyReward;
        bool active;
    }

    address public treasury;
    address public shop;
    address public infiniteChest;
    address public items;
    address public keyToken;

    uint64 public durationDays;
    uint16 public bonusBps;
    uint8 public maxActiveBurnsPerCollection = 5;
    uint256 public nextPositionId;

    mapping(uint256 => DropPosition) public positions;
    mapping(address => uint256[]) private _userPositionIds;
    mapping(address => mapping(uint32 => uint8)) public activeBurnCount;

    event BonusBpsSet(uint16 previousBps, uint16 newBps);
    event DurationDaysSet(uint64 previousDays, uint64 newDays);
    event MaxActiveBurnsPerCollectionSet(uint8 previousMax, uint8 newMax);
    event ExternalContractsSet(
        address treasury,
        address shop,
        address infiniteChest,
        address items,
        address keyToken
    );
    event BurnDropStarted(
        uint256 indexed positionId,
        address indexed user,
        uint32 indexed configId,
        uint64 startDay,
        uint64 endDay,
        uint256 dailyReward,
        uint256 totalReward
    );
    event Claimed(uint256 indexed positionId, address indexed user, uint64 claimDay, uint256 amount);
    event FullClaimed(address indexed user, uint64 claimDay, uint256 amount, uint256 positionsClaimed);
    event DropExpired(uint256 indexed positionId, address indexed user, uint32 indexed configId, uint64 day);

    constructor(
        address treasury_,
        address shop_,
        address infiniteChest_,
        address items_,
        address keyToken_,
        uint64 durationDays_
    ) Ownable(msg.sender) {
        require(treasury_ != address(0), "invalid treasury");
        require(shop_ != address(0), "invalid shop");
        require(infiniteChest_ != address(0), "invalid chest");
        require(items_ != address(0), "invalid items");
        require(keyToken_ != address(0), "invalid key token");
        require(durationDays_ > 0, "invalid duration");

        treasury = treasury_;
        shop = shop_;
        infiniteChest = infiniteChest_;
        items = items_;
        keyToken = keyToken_;
        durationDays = durationDays_;
    }

    function setExternalContracts(
        address treasury_,
        address shop_,
        address infiniteChest_,
        address items_,
        address keyToken_
    ) external onlyOwner {
        require(treasury_ != address(0), "invalid treasury");
        require(shop_ != address(0), "invalid shop");
        require(infiniteChest_ != address(0), "invalid chest");
        require(items_ != address(0), "invalid items");
        require(keyToken_ != address(0), "invalid key token");

        treasury = treasury_;
        shop = shop_;
        infiniteChest = infiniteChest_;
        items = items_;
        keyToken = keyToken_;

        emit ExternalContractsSet(treasury_, shop_, infiniteChest_, items_, keyToken_);
    }

    function setBonusBps(uint16 newBps) external onlyOwner {
        require(newBps <= BP_VALUE, "invalid bps");
        uint16 previousBps = bonusBps;
        bonusBps = newBps;
        emit BonusBpsSet(previousBps, newBps);
    }

    function setDurationDays(uint64 newDurationDays) external onlyOwner {
        require(newDurationDays > 0, "invalid duration");
        uint64 previousDays = durationDays;
        durationDays = newDurationDays;
        emit DurationDaysSet(previousDays, newDurationDays);
    }

    function setMaxActiveBurnsPerCollection(uint8 newMax) external onlyOwner {
        require(newMax > 0, "invalid max");
        uint8 previousMax = maxActiveBurnsPerCollection;
        maxActiveBurnsPerCollection = newMax;
        emit MaxActiveBurnsPerCollectionSet(previousMax, newMax);
    }

    function burnCollectionForDrop(uint32 configId) external returns (uint256 positionId) {
        _cleanupExpired(msg.sender, configId);
        require(
            activeBurnCount[msg.sender][configId] < maxActiveBurnsPerCollection,
            "max active burns reached"
        );

        IInfiniteChestConfigReader.ChestConfig memory config =
            IInfiniteChestConfigReader(infiniteChest).getConfig(configId);
        require(config.tokenIds.length > 0, "empty collection");

        uint256[] memory burnAmounts = new uint256[](config.tokenIds.length);
        uint256 baseValue;

        for (uint256 i = 0; i < config.tokenIds.length; i++) {
            uint256 tokenId = config.tokenIds[i];
            require(
                IERC1155BurnableItems(items).balanceOf(msg.sender, tokenId) >= 1,
                "missing collection item"
            );

            uint256 tokenUnitPrice = IShopPriceReader(shop).tokenPrice(tokenId);
            require(tokenUnitPrice > 0, "token price missing");
            baseValue += tokenUnitPrice;
            burnAmounts[i] = 1;
        }

        IERC1155BurnableItems(items).burnBatchFrom(msg.sender, config.tokenIds, burnAmounts);

        uint256 totalReward = (baseValue * (BP_VALUE + bonusBps)) / BP_VALUE;
        uint256 rewardPerDay = totalReward / durationDays;
        require(rewardPerDay > 0, "reward too small");

        uint64 today = _currentDay();
        uint64 endDay = today + durationDays - 1;

        positionId = nextPositionId++;
        positions[positionId] = DropPosition({
            user: msg.sender,
            configId: configId,
            startDay: today,
            endDay: endDay,
            lastClaimDay: today - 1,
            dailyReward: rewardPerDay,
            active: true
        });

        _userPositionIds[msg.sender].push(positionId);
        activeBurnCount[msg.sender][configId] += 1;

        emit BurnDropStarted(positionId, msg.sender, configId, today, endDay, rewardPerDay, totalReward);
    }

    function claim(uint256 positionId) external returns (uint256 amount) {
        amount = _claimSingle(positionId, msg.sender, true);
        ITreasuryPayout(treasury).withdraw(keyToken, msg.sender, amount);
    }

    function fullClaim() external returns (uint256 totalClaimed, uint256 claimedPositions) {
        uint256[] storage ids = _userPositionIds[msg.sender];

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 claimed = _claimSingle(ids[i], msg.sender, false);
            if (claimed > 0) {
                totalClaimed += claimed;
                claimedPositions++;
            }
        }

        require(totalClaimed > 0, "nothing to claim");
        ITreasuryPayout(treasury).withdraw(keyToken, msg.sender, totalClaimed);
        emit FullClaimed(msg.sender, _currentDay(), totalClaimed, claimedPositions);
    }

    function expireDrop(uint256 positionId) external {
        DropPosition storage position = positions[positionId];
        require(position.active, "inactive drop");
        require(position.user == msg.sender || msg.sender == owner(), "not authorized");
        require(_currentDay() > position.endDay, "drop not expired");
        _deactivate(positionId, position);
    }

    function pendingToday(uint256 positionId) external view returns (uint256) {
        DropPosition storage position = positions[positionId];
        if (!_isClaimableToday(position, _currentDay())) {
            return 0;
        }
        return position.dailyReward;
    }

    function getUserPositionIds(address user) external view returns (uint256[] memory) {
        return _userPositionIds[user];
    }

    function _claimSingle(
        uint256 positionId,
        address user,
        bool revertWhenNoClaim
    ) internal returns (uint256 amount) {
        DropPosition storage position = positions[positionId];
        require(position.user == user, "not position owner");

        uint64 today = _currentDay();
        if (position.active && today > position.endDay) {
            _deactivate(positionId, position);
        }

        bool claimable = _isClaimableToday(position, today);
        if (!claimable) {
            if (revertWhenNoClaim) {
                revert("nothing to claim");
            }
            return 0;
        }

        position.lastClaimDay = today;
        amount = position.dailyReward;
        emit Claimed(positionId, user, today, amount);

        if (today == position.endDay) {
            _deactivate(positionId, position);
        }
    }

    function _cleanupExpired(address user, uint32 configId) internal {
        uint256[] storage ids = _userPositionIds[user];
        uint64 today = _currentDay();

        for (uint256 i = 0; i < ids.length; i++) {
            DropPosition storage position = positions[ids[i]];
            if (position.active && position.configId == configId && today > position.endDay) {
                _deactivate(ids[i], position);
            }
        }
    }

    function _deactivate(uint256 positionId, DropPosition storage position) internal {
        if (!position.active) {
            return;
        }

        position.active = false;

        uint8 count = activeBurnCount[position.user][position.configId];
        if (count > 0) {
            activeBurnCount[position.user][position.configId] = count - 1;
        }

        emit DropExpired(positionId, position.user, position.configId, _currentDay());
    }

    function _isClaimableToday(DropPosition storage position, uint64 today) internal view returns (bool) {
        if (!position.active) {
            return false;
        }

        if (today < position.startDay || today > position.endDay) {
            return false;
        }

        return position.lastClaimDay < today;
    }

    function _currentDay() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }
}
