// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChestMechanics} from "./mechanics/ChestMechanics.sol";

interface IERC1155Mintable {
    function mint(address to, uint256 id, uint256 amount) external;
    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts) external;
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
    function updateConfigFromChest(
        uint32 configId,
        uint256[] calldata tokenIds,
        uint64[] calldata multipliers,
        uint256 chestPrice
    ) external;
    function autoSellFromChest(
        uint32 configId,
        address user,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external returns (uint256 totalPrice);
}

interface IUserStats {
    function ensureUserKey(address user) external returns (bytes32);
    function setReferrer(address user, address referrer) external;
    function recordOpen(address user, uint256 keySpent) external;
    function recordOpenBatch(address user, uint256 opens, uint256 keySpent) external;
    function recordReferrerReward(address referrer, uint256 reward) external;
    function getReferrer(address user) external view returns (address);
}

//add multi open feature

contract InfiniteChest is Ownable, ChestMechanics {
    uint16 internal constant BP_VALUE = 10_000;
    uint256 public constant BONUS_ID_BASE = 10_000_000_000;
    uint32 public constant BONUS_ID_COUNT = 25;
    uint32 public maxResultsPerConfig = 25;
    uint32 public maxBatch = 50;
    uint32 public maxTotalRollsPerTx = 500;

    struct ChestConfig {
        address token;
        uint256 price;
        uint72[] weightRanges;
        uint64[] multipliers;
        uint256[] tokenIds;
    }
    struct NewConfigInput {
        address token;
        uint256 price;
        uint64[] weights;
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
    mapping(uint256 => uint32) public bonusOpensByTokenId;
    // TODO: Add session-based user authorization for delegated opens (EIP-712 style),
    // including validUntil and maxAmount limits to avoid requiring a signature per tx.

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
    event ConfigUpdated(uint32 indexed configId, address indexed token, uint256 price);
    event BonusOpensSet(uint256 indexed tokenId, uint32 opens);
    event ExternalContractsSet(address indexed treasury, address indexed itemsContract, address indexed shop, address userStats);
    event MaxBatchSet(uint32 previousValue, uint32 newValue);
    event MaxTotalRollsPerTxSet(uint32 previousValue, uint32 newValue);
    event MaxResultsPerConfigSet(uint32 previousValue, uint32 newValue);
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
    event ChestBatchOpened(
        address indexed caller,
        address indexed user,
        uint32 indexed configId,
        uint256 startNonce,
        uint32 paidOpens,
        uint32 bonusOpens,
        bool autoSell,
        address paymentToken,
        uint256 totalPrice,
        uint256[] rolledIndexes
    );

    constructor(address treasury_, address itemsContract_, address shop_, address userStats_) Ownable(msg.sender) {
        treasury = treasury_;
        itemsContract = itemsContract_;
        shop = shop_;
        userStats = userStats_;

        // Initialize fixed global bonus IDs:
        // [10_000_000_001 .. 10_000_000_025] => [+1 .. +25 opens]
        for (uint32 i = 1; i <= BONUS_ID_COUNT; i++) {
            bonusOpensByTokenId[BONUS_ID_BASE + i] = i;
        }
    }

    modifier onlyPermittedOrOwner() {
        require(permittedCallers[msg.sender] || msg.sender == owner(), "InfiniteChest: not permitted");
        _;
    }

    function setPermittedCaller(address account, bool allowed) external onlyOwner {
        permittedCallers[account] = allowed;
        emit PermittedCallerSet(account, allowed);
    }

    function setReferralRewardBps(uint16 newBps) external onlyOwner {
        require(newBps <= BP_VALUE, "InfiniteChest: invalid bps");
        uint16 previousBps = ITreasury(treasury).referralRewardBps();
        ITreasury(treasury).setReferralRewardBps(newBps);
        emit ReferralRewardBpsSet(previousBps, newBps);
    }

    function setExternalContracts(
        address treasury_,
        address itemsContract_,
        address shop_,
        address userStats_
    ) external onlyOwner {
        require(treasury_ != address(0), "InfiniteChest: invalid treasury");
        require(itemsContract_ != address(0), "InfiniteChest: invalid items");
        require(shop_ != address(0), "InfiniteChest: invalid shop");
        require(userStats_ != address(0), "InfiniteChest: invalid userStats");

        treasury = treasury_;
        itemsContract = itemsContract_;
        shop = shop_;
        userStats = userStats_;

        emit ExternalContractsSet(treasury_, itemsContract_, shop_, userStats_);
    }

    function setMaxBatch(uint32 newMaxBatch) external onlyOwner {
        require(newMaxBatch > 0, "InfiniteChest: invalid max batch");
        uint32 previousValue = maxBatch;
        maxBatch = newMaxBatch;
        emit MaxBatchSet(previousValue, newMaxBatch);
    }

    function setMaxResultsPerConfig(uint32 newMaxResultsPerConfig) external onlyOwner {
        require(newMaxResultsPerConfig > 0, "InfiniteChest: invalid max results");
        uint32 previousValue = maxResultsPerConfig;
        maxResultsPerConfig = newMaxResultsPerConfig;
        emit MaxResultsPerConfigSet(previousValue, newMaxResultsPerConfig);
    }

    function setMaxTotalRollsPerTx(uint32 newMaxTotalRollsPerTx) external onlyOwner {
        require(newMaxTotalRollsPerTx > 0, "InfiniteChest: invalid max rolls");
        uint32 previousValue = maxTotalRollsPerTx;
        maxTotalRollsPerTx = newMaxTotalRollsPerTx;
        emit MaxTotalRollsPerTxSet(previousValue, newMaxTotalRollsPerTx);
    }

    function setBonusOpens(uint256 tokenId, uint32 opens) external onlyOwner {
        bonusOpensByTokenId[tokenId] = opens;
        emit BonusOpensSet(tokenId, opens);
    }

    function addConfig(
        address token,
        uint256 price,
        uint64[] calldata weights,
        uint64[] calldata multipliers,
        uint256[] calldata tokenIds
    ) external onlyPermittedOrOwner returns (uint32 configId) {
        configId = _createConfig(token, price, weights, multipliers, tokenIds);
    }

    function addConfigsBatch(
        NewConfigInput[] calldata configs
    ) external onlyPermittedOrOwner returns (uint32[] memory configIds) {
        require(configs.length > 0, "InfiniteChest: empty batch");
        configIds = new uint32[](configs.length);

        for (uint256 i = 0; i < configs.length; i++) {
            NewConfigInput calldata item = configs[i];
            configIds[i] = _createConfig(item.token, item.price, item.weights, item.multipliers, item.tokenIds);
        }
    }

    function updateConfig(
        uint32 configId,
        address token,
        uint256 price,
        uint64[] calldata weights,
        uint64[] calldata multipliers,
        uint256[] calldata tokenIds
    ) external onlyPermittedOrOwner {
        require(configId < configCount, "InfiniteChest: config not found");
        _validateConfigInputs(token, price, weights, multipliers, tokenIds);

        uint72[] memory weightRanges = _buildWeightRanges(weights);
        ChestConfig storage config = _configs[configId];
        config.token = token;
        config.price = price;
        config.weightRanges = weightRanges;
        config.multipliers = multipliers;
        config.tokenIds = tokenIds;

        IShop(shop).updateConfigFromChest(configId, tokenIds, multipliers, price);
        emit ConfigUpdated(configId, token, price);
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

    function openBatch(
        uint32 configId,
        address userAddress,
        uint32 amount
    ) external onlyPermittedOrOwner returns (uint256[] memory rolledIndexes) {
        rolledIndexes = _openBatch(configId, userAddress, amount, false);
    }

    function openBatch(
        uint32 configId,
        address userAddress,
        uint32 amount,
        bool autoSell
    ) external onlyPermittedOrOwner returns (uint256[] memory rolledIndexes) {
        rolledIndexes = _openBatch(configId, userAddress, amount, autoSell);
    }

    function _open(uint32 configId, address userAddress) internal returns (uint256 rolledIndex) {
        require(userAddress != address(0), "InfiniteChest: invalid user");
        ChestConfig storage config = _configs[configId];
        require(config.weightRanges.length > 0, "InfiniteChest: config not found");

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

    function _openBatch(
        uint32 configId,
        address userAddress,
        uint32 amount,
        bool autoSell
    ) internal returns (uint256[] memory rolledIndexes) {
        require(userAddress != address(0), "InfiniteChest: invalid user");
        require(amount > 0 && amount <= maxBatch, "InfiniteChest: invalid batch amount");

        ChestConfig storage config = _configs[configId];
        require(config.weightRanges.length > 0, "InfiniteChest: config not found");

        bytes32 userKey = IUserStats(userStats).ensureUserKey(userAddress);
        uint256 startNonce = nonce[userAddress];
        uint256 totalPrice = config.price * amount;

        (address referrer, uint256 referrerReward,) = ITreasury(treasury).deposit(
            config.token,
            userAddress,
            totalPrice
        );

        if (referrerReward > 0) {
            IUserStats(userStats).recordReferrerReward(referrer, referrerReward);
            emit ReferrerRewardPaid(userAddress, referrer, configId, referrerReward);
        }

        RollAccumulator memory rollAccumulator = _initRollAccumulator(
            maxTotalRollsPerTx,
            config.tokenIds.length
        );
        uint32 bonusOpens;

        for (uint256 i = 0; i < amount; i++) {
            uint256 rolledIndex = _roll(configId, userAddress, userKey);
            _recordRoll(rollAccumulator, rolledIndex);

            uint256 rolledTokenId = config.tokenIds[rolledIndex];
            uint32 tokenBonusOpens = bonusOpensByTokenId[rolledTokenId];
            if (tokenBonusOpens > 0) {
                bonusOpens += tokenBonusOpens;
            }
        }

        uint32 totalRolls = amount + bonusOpens;
        require(totalRolls <= maxTotalRollsPerTx, "InfiniteChest: max total rolls exceeded");

        // Bonus phase does not retrigger additional bonus opens.
        for (uint256 i = 0; i < bonusOpens; i++) {
            uint256 rolledIndex = _roll(configId, userAddress, userKey);
            _recordRoll(rollAccumulator, rolledIndex);
        }

        rolledIndexes = _finalizeRolledIndexes(rollAccumulator);
        (uint256[] memory mintIds, uint256[] memory mintAmounts) = _buildMintBatch(
            config.tokenIds,
            rollAccumulator.resultCounts
        );

        if (autoSell) {
            IShop(shop).autoSellFromChest(configId, userAddress, mintIds, mintAmounts);
        } else {
            IERC1155Mintable(itemsContract).mintBatch(userAddress, mintIds, mintAmounts);
        }
        IUserStats(userStats).recordOpenBatch(userAddress, totalRolls, totalPrice);

        emit ChestBatchOpened(
            msg.sender,
            userAddress,
            configId,
            startNonce,
            amount,
            bonusOpens,
            autoSell,
            config.token,
            totalPrice,
            rolledIndexes
        );
    }

    function _setReferrerIfNeeded(address userAddress, address referrer) internal {
        require(userAddress != address(0), "InfiniteChest: invalid user");
        require(referrer != address(0), "InfiniteChest: invalid referrer");
        address currentReferrer = IUserStats(userStats).getReferrer(userAddress);
        if (currentReferrer == address(0)) {
            IUserStats(userStats).setReferrer(userAddress, referrer);
        } else {
            require(currentReferrer == referrer, "InfiniteChest: referrer already set");
        }
    }

    function getConfig(uint32 configId) external view returns (ChestConfig memory) {
        return _configs[configId];
    }

    function _createConfig(
        address token,
        uint256 price,
        uint64[] calldata weights,
        uint64[] calldata multipliers,
        uint256[] calldata tokenIds
    ) internal returns (uint32 configId) {
        _validateConfigInputs(token, price, weights, multipliers, tokenIds);
        uint72[] memory weightRanges = _buildWeightRanges(weights);

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

    function _validateConfigInputs(
        address token,
        uint256 price,
        uint64[] calldata weights,
        uint64[] calldata multipliers,
        uint256[] calldata tokenIds
    ) internal view {
        require(token != address(0), "InfiniteChest: invalid token");
        require(price > 0, "InfiniteChest: invalid price");
        require(weights.length > 0, "InfiniteChest: empty config");
        require(weights.length <= maxResultsPerConfig, "InfiniteChest: too many results");
        require(weights.length == multipliers.length, "InfiniteChest: length mismatch");
        require(weights.length == tokenIds.length, "InfiniteChest: length mismatch");
    }

    function _buildWeightRanges(uint64[] calldata weights) internal pure returns (uint72[] memory weightRanges) {
        weightRanges = new uint72[](weights.length);
        uint72 totalWeight;
        for (uint256 i = 0; i < weights.length; i++) {
            require(weights[i] > 0, "InfiniteChest: invalid weight");
            totalWeight += weights[i];
            weightRanges[i] = totalWeight;
        }
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
