// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC1155Mintable {
    function mint(address to, uint256 id, uint256 amount) external;
}

interface ITreasury {
    function deposit(
        address token,
        address from,
        uint256 amount
    ) external returns (address referrer, uint256 referrerAmount, uint256 treasuryAmount);
    function setReferralRewardBps(uint16 newBps) external;
    function referralRewardBps() external view returns (uint16);
}

interface IShop {
    function createConfigFromChest(
        uint32 configId,
        uint256[] calldata tokenIds,
        uint64[] calldata multipliers,
        uint256 chestPrice
    ) external;
}

interface IUserStats {
    function ensureUserKey(address user) external returns (bytes32);
    function setReferrer(address user, address referrer) external;
    function recordOpen(address user, uint256 keySpent) external;
    function recordReferrerReward(address referrer, uint256 reward) external;
    function getReferrer(address user) external view returns (address);
}

contract InfiniteChest is Ownable {
    uint16 internal constant BP_VALUE = 10_000;

    struct ChestConfig {
        address token;
        uint256 price;
        uint72[] weightRanges;
        uint64[] multipliers;
        uint256[] tokenIds;
    }

    address public treasury;
    address public itemsContract;
    address public shop;
    address public userStats;
    uint32 public configCount;
    mapping(address => uint256) public nonce;
    mapping(address => bool) public permittedCallers;

    mapping(uint32 => ChestConfig) private _configs;

    event PermittedCallerSet(address indexed account, bool allowed);
    event ReferralRewardBpsSet(uint16 previousBps, uint16 newBps);
    event ReferrerRewardPaid(
        address indexed user,
        address indexed referrer,
        uint32 indexed configId,
        uint256 reward
    );
    event ConfigAdded(uint32 indexed configId, address indexed token, uint256 price);
    event ChestOpened(
        address indexed caller,
        address indexed user,
        uint32 indexed configId,
        uint256 rollNonce,
        uint256 rolledIndex,
        uint256 resultTokenId,
        address paymentToken,
        uint256 price
    );

    constructor(address treasury_, address itemsContract_, address shop_, address userStats_) Ownable(msg.sender) {
        treasury = treasury_;
        itemsContract = itemsContract_;
        shop = shop_;
        userStats = userStats_;
    }

    modifier onlyPermittedOrOwner() {
        require(permittedCallers[msg.sender] || msg.sender == owner(), "not permitted");
        _;
    }

    function setPermittedCaller(address account, bool allowed) external onlyOwner {
        permittedCallers[account] = allowed;
        emit PermittedCallerSet(account, allowed);
    }

    function setReferralRewardBps(uint16 newBps) external onlyOwner {
        require(newBps <= BP_VALUE, "invalid bps");
        uint16 previousBps = ITreasury(treasury).referralRewardBps();
        ITreasury(treasury).setReferralRewardBps(newBps);
        emit ReferralRewardBpsSet(previousBps, newBps);
    }

    function addConfig(
        address token,
        uint256 price,
        uint64[] calldata weights,
        uint64[] calldata multipliers,
        uint256[] calldata tokenIds
    ) external onlyPermittedOrOwner returns (uint32 configId) {
        require(token != address(0), "invalid token");
        require(price > 0, "invalid price");
        require(weights.length > 0, "empty config");
        require(weights.length <= 16, "too many results");
        require(weights.length == multipliers.length, "length mismatch");
        require(weights.length == tokenIds.length, "length mismatch");

        uint72[] memory weightRanges = new uint72[](weights.length);
        uint72 totalWeight;

        for (uint256 i = 0; i < weights.length; i++) {
            require(weights[i] > 0, "invalid weight");
            totalWeight += weights[i];
            weightRanges[i] = totalWeight;
        }

        configId = configCount;
        ChestConfig storage config = _configs[configId];
        config.token = token;
        config.price = price;
        config.weightRanges = weightRanges;
        config.multipliers = multipliers;
        config.tokenIds = tokenIds;

        configCount++;

        IShop(shop).createConfigFromChest(configId, tokenIds, multipliers, price);

        emit ConfigAdded(configId, token, price);
    }

    function open(uint32 configId, address userAddress) external onlyPermittedOrOwner returns (uint256 rolledIndex) {
        rolledIndex = _open(configId, userAddress);
    }

    function open(uint32 configId) external onlyPermittedOrOwner returns (uint256 rolledIndex) {
        rolledIndex = _open(configId, msg.sender);
    }

    function openAndSetReferrer(
        uint32 configId,
        address userAddress,
        address referrer
    ) external onlyPermittedOrOwner returns (uint256 rolledIndex) {
        _setReferrerIfNeeded(userAddress, referrer);
        rolledIndex = _open(configId, userAddress);
    }

    function openAndSetReferrer(
        uint32 configId,
        address referrer
    ) external onlyPermittedOrOwner returns (uint256 rolledIndex) {
        _setReferrerIfNeeded(msg.sender, referrer);
        rolledIndex = _open(configId, msg.sender);
    }


    function _open(uint32 configId, address userAddress) internal returns (uint256 rolledIndex) {
        require(userAddress != address(0), "invalid user");
        ChestConfig storage config = _configs[configId];
        require(config.weightRanges.length > 0, "config not found");

        bytes32 userKey = IUserStats(userStats).ensureUserKey(userAddress);
        uint256 rollNonce = nonce[userAddress];

        (address referrer, uint256 referrerReward,) = ITreasury(treasury).deposit(
            config.token,
            userAddress,
            config.price
        );

        if (referrerReward > 0) {
            IUserStats(userStats).recordReferrerReward(referrer, referrerReward);
            emit ReferrerRewardPaid(userAddress, referrer, configId, referrerReward);
        }

        rolledIndex = _roll(configId, userAddress, userKey);

        uint256 resultTokenId = config.tokenIds[rolledIndex];

        IERC1155Mintable(itemsContract).mint(userAddress, resultTokenId, 1);
        IUserStats(userStats).recordOpen(userAddress, config.price);

        emit ChestOpened(
            msg.sender,
            userAddress,
            configId,
            rollNonce,
            rolledIndex,
            resultTokenId,
            config.token,
            config.price
        );
    }

    function _setReferrerIfNeeded(address userAddress, address referrer) internal {
        require(userAddress != address(0), "invalid user");
        require(referrer != address(0), "invalid referrer");
        address currentReferrer = IUserStats(userStats).getReferrer(userAddress);
        if (currentReferrer == address(0)) {
            IUserStats(userStats).setReferrer(userAddress, referrer);
        } else {
            require(currentReferrer == referrer, "referrer already set");
        }
    }

    function getConfig(uint32 configId) external view returns (ChestConfig memory) {
        return _configs[configId];
    }

    function _roll(uint32 configId, address user, bytes32 userKey) internal returns (uint256 rolledIndex) {
        ChestConfig storage config = _configs[configId];
        uint256 randomWord = uint256(
            keccak256(
                abi.encode(block.timestamp, block.prevrandao, user, userKey, configId, nonce[user]++)
            )
        );

        uint72 rolledWeight = uint72(
            randomWord % config.weightRanges[config.weightRanges.length - 1]
        );

        for (uint256 i = 0; i < config.weightRanges.length; i++) {
            if (rolledWeight < config.weightRanges[i]) {
                return i;
            }
        }

        revert("roll failed");
    }
}
