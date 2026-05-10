// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

interface IUserStatsQuest {
    function addExp(address user, uint256 amount) external;
    function recordDailyActivity(
        address user
    ) external returns (bool countedToday, uint32 currentStreak, bool milestoneReached);
    function levelOf(address user) external view returns (uint32);
}

interface IQuestItems is IERC1155 {
    function burnBatchFrom(address from, uint256[] calldata ids, uint256[] calldata amounts) external;
}

interface IQuestShop {
    function tokenPrice(uint256 tokenId) external view returns (uint256);
}

contract QuestController is Ownable, ReentrancyGuard, EIP712, ERC1155Holder {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    uint16 internal constant BP_VALUE = 10_000;
    bytes32 internal constant ACCEPT_QUEST_TYPEHASH =
        keccak256("AcceptQuest(address user,uint256 templateId,uint256 nonce,uint64 deadline)");
    bytes32 internal constant CLAIM_QUEST_TYPEHASH =
        keccak256("ClaimQuest(address user,uint256 acceptedQuestId,uint256 nonce,uint64 deadline)");
    bytes32 internal constant CLAIM_STREAK_TYPEHASH =
        keccak256("ClaimStreakReward(address user,uint256 nonce,uint64 deadline)");

    enum QuestKind {
        OpenCount,
        OpenBeforeDeadline,
        OpenSpecificConfig,
        OpenRandomConfig,
        BatchOpenOnce,
        BonusOpenCount,
        BurnSpecificToken,
        BurnRandomTokenFromPool,
        CompleteNQuestsBeforeDeadline
    }

    struct QuestTemplate {
        QuestKind kind;
        bool active;
        bool snapshotReward;
        uint32 target;
        uint32 fixedConfigId;
        uint32 minLevelToAccept;
        uint32 budgetGroupId;
        uint64 acceptStart;
        uint64 acceptEnd;
        uint64 completionWindow;
        uint16 burnRewardBonusBps;
        uint256 fixedTokenId;
        uint256 rewardAmount;
        uint256 rewardNftTokenId;
        uint256 rewardNftAmount;
        uint256 expReward;
        uint256 maxRewardPerMission;
        address rewardToken;
        address rewardNft;
    }

    struct QuestTemplateInput {
        QuestKind kind;
        bool active;
        bool snapshotReward;
        uint32 target;
        uint32 fixedConfigId;
        uint32 minLevelToAccept;
        uint32 budgetGroupId;
        uint64 acceptStart;
        uint64 acceptEnd;
        uint64 completionWindow;
        uint16 burnRewardBonusBps;
        uint256 fixedTokenId;
        uint256 rewardAmount;
        uint256 rewardNftTokenId;
        uint256 rewardNftAmount;
        uint256 expReward;
        uint256 maxRewardPerMission;
        address rewardToken;
        address rewardNft;
    }

    struct AcceptedQuest {
        uint256 templateId;
        address user;
        uint64 acceptedAt;
        uint64 deadline;
        uint32 progress;
        uint32 resolvedConfigId;
        uint256 resolvedTokenId;
        uint256 expReward;
        bool completed;
        bool claimed;
        address rewardToken;
        uint256 rewardAmount;
        address rewardNft;
        uint256 rewardNftTokenId;
        uint256 rewardNftAmount;
    }

    address public infiniteChest;
    address public userStats;
    address public items;
    address public shop;
    address public streakRewardToken;

    uint256 public templateCount;
    uint256 public acceptedQuestCount;
    uint32 public maxActiveQuestsPerUser = 3;
    uint256 public expPerPaidOpen = 10;
    uint256 public dailyStreakExpReward = 50;
    uint256 public streakRewardAmount;
    uint32 public streakRewardBudgetGroupId;

    mapping(address => bool) public allowedRewardTokens;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public randomNonce;
    mapping(address => uint256) public pendingStreakRewards;
    mapping(uint32 => uint256) public dailyBudgetCap;
    mapping(uint32 => mapping(uint64 => uint256)) public dailyBudgetSpent;
    mapping(uint256 => QuestTemplate) private _templates;
    mapping(uint256 => AcceptedQuest) public acceptedQuests;
    mapping(address => uint256[]) private _activeQuestIds;
    mapping(uint256 => uint32[]) private _templateConfigPools;
    mapping(uint256 => uint256[]) private _templateTokenPools;

    event InfiniteChestSet(address indexed previousInfiniteChest, address indexed newInfiniteChest);
    event UserStatsSet(address indexed previousUserStats, address indexed newUserStats);
    event ItemsSet(address indexed previousItems, address indexed newItems);
    event ShopSet(address indexed previousShop, address indexed newShop);
    event AllowedRewardTokenSet(address indexed token, bool allowed);
    event MaxActiveQuestsPerUserSet(uint32 previousValue, uint32 newValue);
    event ExpPerPaidOpenSet(uint256 previousValue, uint256 newValue);
    event DailyStreakExpRewardSet(uint256 previousValue, uint256 newValue);
    event StreakRewardSet(address indexed token, uint256 amount);
    event StreakRewardBudgetGroupSet(uint32 previousValue, uint32 newValue);
    event DailyBudgetCapSet(uint32 indexed budgetGroupId, uint256 previousCap, uint256 newCap);
    event TemplateCreated(uint256 indexed templateId, QuestKind kind);
    event TemplateUpdated(uint256 indexed templateId, QuestKind kind, bool active);
    event QuestAccepted(uint256 indexed acceptedQuestId, uint256 indexed templateId, address indexed user);
    event QuestProgressUpdated(uint256 indexed acceptedQuestId, address indexed user, uint32 progress, bool completed);
    event QuestCompleted(uint256 indexed acceptedQuestId, address indexed user);
    event QuestClaimed(
        uint256 indexed acceptedQuestId,
        uint256 indexed templateId,
        address indexed user,
        address rewardToken,
        uint256 rewardAmount,
        uint256 expReward
    );
    event StreakRewardAccrued(address indexed user, uint256 amount);
    event StreakRewardClaimed(address indexed user, address indexed token, uint256 amount);

    modifier onlyInfiniteChest() {
        require(msg.sender == infiniteChest, "QuestController: not infiniteChest");
        _;
    }

    constructor(address owner_, address userStats_, address items_, address shop_, address defaultRewardToken_) Ownable(owner_) EIP712("QuestController", "1") {
        require(userStats_ != address(0), "QuestController: invalid userStats");
        require(items_ != address(0), "QuestController: invalid items");
        require(shop_ != address(0), "QuestController: invalid shop");

        userStats = userStats_;
        items = items_;
        shop = shop_;

        if (defaultRewardToken_ != address(0)) {
            allowedRewardTokens[defaultRewardToken_] = true;
            streakRewardToken = defaultRewardToken_;
            emit AllowedRewardTokenSet(defaultRewardToken_, true);
            emit StreakRewardSet(defaultRewardToken_, 0);
        }
    }

    function setInfiniteChest(address infiniteChest_) external onlyOwner {
        require(infiniteChest_ != address(0), "QuestController: invalid infiniteChest");
        address previousInfiniteChest = infiniteChest;
        infiniteChest = infiniteChest_;
        emit InfiniteChestSet(previousInfiniteChest, infiniteChest_);
    }

    function setUserStats(address userStats_) external onlyOwner {
        require(userStats_ != address(0), "QuestController: invalid userStats");
        address previousUserStats = userStats;
        userStats = userStats_;
        emit UserStatsSet(previousUserStats, userStats_);
    }

    function setItems(address items_) external onlyOwner {
        require(items_ != address(0), "QuestController: invalid items");
        address previousItems = items;
        items = items_;
        emit ItemsSet(previousItems, items_);
    }

    function setShop(address shop_) external onlyOwner {
        require(shop_ != address(0), "QuestController: invalid shop");
        address previousShop = shop;
        shop = shop_;
        emit ShopSet(previousShop, shop_);
    }

    function setAllowedRewardToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "QuestController: invalid token");
        allowedRewardTokens[token] = allowed;
        emit AllowedRewardTokenSet(token, allowed);
    }

    function setMaxActiveQuestsPerUser(uint32 newMax) external onlyOwner {
        require(newMax > 0, "QuestController: invalid max");
        uint32 previousValue = maxActiveQuestsPerUser;
        maxActiveQuestsPerUser = newMax;
        emit MaxActiveQuestsPerUserSet(previousValue, newMax);
    }

    function setExpPerPaidOpen(uint256 newValue) external onlyOwner {
        uint256 previousValue = expPerPaidOpen;
        expPerPaidOpen = newValue;
        emit ExpPerPaidOpenSet(previousValue, newValue);
    }

    function setDailyStreakExpReward(uint256 newValue) external onlyOwner {
        uint256 previousValue = dailyStreakExpReward;
        dailyStreakExpReward = newValue;
        emit DailyStreakExpRewardSet(previousValue, newValue);
    }

    function setStreakReward(address token, uint256 amount) external onlyOwner {
        require(token == address(0) || allowedRewardTokens[token], "QuestController: reward token not allowed");
        streakRewardToken = token;
        streakRewardAmount = amount;
        emit StreakRewardSet(token, amount);
    }

    function setStreakRewardBudgetGroup(uint32 budgetGroupId) external onlyOwner {
        uint32 previousValue = streakRewardBudgetGroupId;
        streakRewardBudgetGroupId = budgetGroupId;
        emit StreakRewardBudgetGroupSet(previousValue, budgetGroupId);
    }

    function setDailyBudgetCap(uint32 budgetGroupId, uint256 newCap) external onlyOwner {
        uint256 previousCap = dailyBudgetCap[budgetGroupId];
        dailyBudgetCap[budgetGroupId] = newCap;
        emit DailyBudgetCapSet(budgetGroupId, previousCap, newCap);
    }

    function createTemplate(
        QuestTemplateInput calldata input,
        uint32[] calldata configPool,
        uint256[] calldata tokenPool
    ) external onlyOwner returns (uint256 templateId) {
        templateId = templateCount++;
        _setTemplate(templateId, input, configPool, tokenPool);
        emit TemplateCreated(templateId, input.kind);
    }

    function updateTemplate(
        uint256 templateId,
        QuestTemplateInput calldata input,
        uint32[] calldata configPool,
        uint256[] calldata tokenPool
    ) external onlyOwner {
        require(templateId < templateCount, "QuestController: template not found");
        _setTemplate(templateId, input, configPool, tokenPool);
        emit TemplateUpdated(templateId, input.kind, input.active);
    }

    function acceptQuest(uint256 templateId) external returns (uint256 acceptedQuestId) {
        acceptedQuestId = _acceptQuest(msg.sender, templateId);
    }

    function acceptQuestWithSig(
        address user,
        uint256 templateId,
        uint64 deadline,
        bytes calldata signature
    ) external returns (uint256 acceptedQuestId) {
        _useAcceptSignature(user, templateId, deadline, signature);
        acceptedQuestId = _acceptQuest(user, templateId);
    }

    function claimQuest(uint256 acceptedQuestId) external nonReentrant {
        _claimQuest(msg.sender, acceptedQuestId);
    }

    function claimQuestWithSig(
        address user,
        uint256 acceptedQuestId,
        uint64 deadline,
        bytes calldata signature
    ) external nonReentrant {
        _useClaimSignature(user, acceptedQuestId, deadline, signature);
        _claimQuest(user, acceptedQuestId);
    }

    function claimStreakReward() external nonReentrant {
        _claimStreakReward(msg.sender);
    }

    function claimStreakRewardWithSig(
        address user,
        uint64 deadline,
        bytes calldata signature
    ) external nonReentrant {
        _useClaimStreakSignature(user, deadline, signature);
        _claimStreakReward(user);
    }

    function onChestAction(
        address user,
        uint32 configId,
        uint32 paidOpens,
        uint32 bonusOpens,
        uint256, /* keySpent */
        bool isBatch
    ) external onlyInfiniteChest {
        require(user != address(0), "QuestController: invalid user");
        require(paidOpens > 0, "QuestController: invalid paid opens");

        uint256 baseExp = uint256(paidOpens) * expPerPaidOpen;
        if (baseExp > 0) {
            IUserStatsQuest(userStats).addExp(user, baseExp);
        }

        (bool countedToday,, bool milestoneReached) = IUserStatsQuest(userStats).recordDailyActivity(user);
        if (countedToday && dailyStreakExpReward > 0) {
            IUserStatsQuest(userStats).addExp(user, dailyStreakExpReward);
        }

        if (milestoneReached && streakRewardToken != address(0) && streakRewardAmount > 0) {
            pendingStreakRewards[user] += streakRewardAmount;
            emit StreakRewardAccrued(user, streakRewardAmount);
        }

        _cleanupInactiveQuests(user);
        uint256[] storage activeQuestIds = _activeQuestIds[user];
        for (uint256 i = 0; i < activeQuestIds.length; i++) {
            AcceptedQuest storage quest = acceptedQuests[activeQuestIds[i]];
            if (quest.claimed || quest.completed || _isExpired(quest)) {
                continue;
            }

            QuestTemplate storage template = _templates[quest.templateId];
            uint32 progressToAdd;

            if (template.kind == QuestKind.OpenCount || template.kind == QuestKind.OpenBeforeDeadline) {
                progressToAdd = paidOpens;
            } else if (template.kind == QuestKind.OpenSpecificConfig) {
                if (configId == template.fixedConfigId) {
                    progressToAdd = paidOpens;
                }
            } else if (template.kind == QuestKind.OpenRandomConfig) {
                if (configId == quest.resolvedConfigId) {
                    progressToAdd = paidOpens;
                }
            } else if (template.kind == QuestKind.BatchOpenOnce) {
                if (isBatch) {
                    progressToAdd = 1;
                }
            } else if (template.kind == QuestKind.BonusOpenCount) {
                progressToAdd = bonusOpens;
            }

            if (progressToAdd == 0) {
                continue;
            }

            _increaseQuestProgress(activeQuestIds[i], template, progressToAdd);
        }
    }

    function withdrawRewardToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "QuestController: invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    function withdrawRewardNFT(address nft, address to, uint256 tokenId, uint256 amount) external onlyOwner {
        require(to != address(0), "QuestController: invalid recipient");
        IERC1155(nft).safeTransferFrom(address(this), to, tokenId, amount, "");
    }

    function getTemplate(uint256 templateId) external view returns (QuestTemplate memory) {
        return _templates[templateId];
    }

    function getTemplateConfigPool(uint256 templateId) external view returns (uint32[] memory) {
        return _templateConfigPools[templateId];
    }

    function getTemplateTokenPool(uint256 templateId) external view returns (uint256[] memory) {
        return _templateTokenPools[templateId];
    }

    function getActiveQuestIds(address user) external view returns (uint256[] memory) {
        return _activeQuestIds[user];
    }

    struct QuestBoardEntry {
        uint256 acceptedQuestId;
        AcceptedQuest quest;
        QuestTemplate template;
    }

    function getUserQuestBoard(address user) external view returns (
        QuestBoardEntry[] memory board,
        uint256 pendingStreak,
        uint32 maxActive
    ) {
        uint256[] storage ids = _activeQuestIds[user];
        board = new QuestBoardEntry[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            AcceptedQuest storage q = acceptedQuests[ids[i]];
            board[i] = QuestBoardEntry({
                acceptedQuestId: ids[i],
                quest: q,
                template: _templates[q.templateId]
            });
        }

        pendingStreak = pendingStreakRewards[user];
        maxActive = maxActiveQuestsPerUser;
    }

    function previewQuestReward(
        uint256 acceptedQuestId
    ) external view returns (address rewardToken, uint256 rewardAmount, address rewardNft, uint256 rewardNftTokenId, uint256 rewardNftAmount, uint256 expReward) {
        AcceptedQuest storage quest = acceptedQuests[acceptedQuestId];
        QuestTemplate storage template = _templates[quest.templateId];

        rewardToken = quest.rewardToken;
        rewardAmount = quest.rewardAmount;
        rewardNft = quest.rewardNft;
        rewardNftTokenId = quest.rewardNftTokenId;
        rewardNftAmount = quest.rewardNftAmount;
        expReward = quest.expReward;

        if (_isBurnQuest(template.kind)) {
            rewardAmount = _resolveBurnReward(template, quest.resolvedTokenId);
        }
    }

    function _setTemplate(
        uint256 templateId,
        QuestTemplateInput calldata input,
        uint32[] calldata configPool,
        uint256[] calldata tokenPool
    ) internal {
        _validateTemplateInput(input, configPool, tokenPool);

        QuestTemplate storage template = _templates[templateId];
        template.kind = input.kind;
        template.active = input.active;
        template.snapshotReward = input.snapshotReward;
        template.target = input.target;
        template.fixedConfigId = input.fixedConfigId;
        template.minLevelToAccept = input.minLevelToAccept;
        template.budgetGroupId = input.budgetGroupId;
        template.acceptStart = input.acceptStart;
        template.acceptEnd = input.acceptEnd;
        template.completionWindow = input.completionWindow;
        template.burnRewardBonusBps = input.burnRewardBonusBps;
        template.fixedTokenId = input.fixedTokenId;
        template.rewardAmount = input.rewardAmount;
        template.rewardNftTokenId = input.rewardNftTokenId;
        template.rewardNftAmount = input.rewardNftAmount;
        template.expReward = input.expReward;
        template.maxRewardPerMission = input.maxRewardPerMission;
        template.rewardToken = input.rewardToken;
        template.rewardNft = input.rewardNft;

        delete _templateConfigPools[templateId];
        for (uint256 i = 0; i < configPool.length; i++) {
            _templateConfigPools[templateId].push(configPool[i]);
        }

        delete _templateTokenPools[templateId];
        for (uint256 i = 0; i < tokenPool.length; i++) {
            _templateTokenPools[templateId].push(tokenPool[i]);
        }
    }

    function _validateTemplateInput(
        QuestTemplateInput calldata input,
        uint32[] calldata configPool,
        uint256[] calldata tokenPool
    ) internal view {
        if (_requiresTarget(input.kind)) {
            require(input.target > 0, "QuestController: invalid target");
        }

        if (input.acceptStart > 0 && input.acceptEnd > 0) {
            require(input.acceptStart <= input.acceptEnd, "QuestController: invalid accept window");
        }

        if (input.rewardToken != address(0)) {
            require(allowedRewardTokens[input.rewardToken], "QuestController: reward token not allowed");
        }

        if (input.kind == QuestKind.OpenRandomConfig) {
            require(configPool.length > 0, "QuestController: empty config pool");
        }

        if (input.kind == QuestKind.BurnSpecificToken) {
            require(input.fixedTokenId > 0, "QuestController: invalid tokenId");
            require(input.rewardToken != address(0), "QuestController: burn reward token required");
        }

        if (input.kind == QuestKind.BurnRandomTokenFromPool) {
            require(tokenPool.length > 0, "QuestController: empty token pool");
            require(input.rewardToken != address(0), "QuestController: burn reward token required");
        }
    }

    function _acceptQuest(address user, uint256 templateId) internal returns (uint256 acceptedQuestId) {
        require(user != address(0), "QuestController: invalid user");
        require(templateId < templateCount, "QuestController: template not found");

        _cleanupInactiveQuests(user);
        require(_activeQuestIds[user].length < maxActiveQuestsPerUser, "QuestController: max active quests");

        QuestTemplate storage template = _templates[templateId];
        require(template.active, "QuestController: inactive template");

        uint64 nowTs = uint64(block.timestamp);
        if (template.acceptStart > 0) {
            require(nowTs >= template.acceptStart, "QuestController: quest not started");
        }
        if (template.acceptEnd > 0) {
            require(nowTs <= template.acceptEnd, "QuestController: quest acceptance ended");
        }

        require(
            IUserStatsQuest(userStats).levelOf(user) >= template.minLevelToAccept,
            "QuestController: insufficient level"
        );

        acceptedQuestId = acceptedQuestCount++;
        AcceptedQuest storage quest = acceptedQuests[acceptedQuestId];
        quest.templateId = templateId;
        quest.user = user;
        quest.acceptedAt = nowTs;
        quest.deadline = _resolveDeadline(template, nowTs);
        quest.expReward = template.expReward;
        quest.rewardToken = template.rewardToken;
        quest.rewardNft = template.rewardNft;
        quest.rewardNftTokenId = template.rewardNftTokenId;
        quest.rewardNftAmount = template.rewardNftAmount;

        if (template.snapshotReward) {
            quest.rewardAmount = template.rewardAmount;
        }

        if (template.kind == QuestKind.OpenRandomConfig) {
            quest.resolvedConfigId = _resolveConfig(templateId, user);
        } else if (template.kind == QuestKind.OpenSpecificConfig) {
            quest.resolvedConfigId = template.fixedConfigId;
        }

        if (template.kind == QuestKind.BurnSpecificToken) {
            quest.resolvedTokenId = template.fixedTokenId;
        } else if (template.kind == QuestKind.BurnRandomTokenFromPool) {
            quest.resolvedTokenId = _resolveTokenId(templateId, user);
        }

        _activeQuestIds[user].push(acceptedQuestId);
        emit QuestAccepted(acceptedQuestId, templateId, user);
    }

    function _claimQuest(address user, uint256 acceptedQuestId) internal {
        AcceptedQuest storage quest = acceptedQuests[acceptedQuestId];
        require(quest.user == user, "QuestController: not quest owner");
        require(!quest.claimed, "QuestController: already claimed");

        QuestTemplate storage template = _templates[quest.templateId];

        if (_isBurnQuest(template.kind)) {
            require(!_isExpired(quest), "QuestController: quest expired");
            _burnQuestToken(user, quest.resolvedTokenId);
            quest.progress = 1;
            quest.completed = true;
            emit QuestCompleted(acceptedQuestId, user);
        } else {
            require(quest.completed, "QuestController: quest not completed");
        }

        uint256 rewardAmount = quest.rewardAmount;
        if (_isBurnQuest(template.kind)) {
            rewardAmount = _resolveBurnReward(template, quest.resolvedTokenId);
        }

        rewardAmount = _applyPerMissionCap(rewardAmount, template.maxRewardPerMission);
        _consumeDailyBudget(template.budgetGroupId, rewardAmount);

        quest.claimed = true;
        _removeActiveQuest(user, acceptedQuestId);

        if (quest.expReward > 0) {
            IUserStatsQuest(userStats).addExp(user, quest.expReward);
        }

        if (quest.rewardToken != address(0) && rewardAmount > 0) {
            IERC20(quest.rewardToken).safeTransfer(user, rewardAmount);
        }

        if (quest.rewardNft != address(0) && quest.rewardNftAmount > 0) {
            IERC1155(quest.rewardNft).safeTransferFrom(
                address(this),
                user,
                quest.rewardNftTokenId,
                quest.rewardNftAmount,
                ""
            );
        }

        emit QuestClaimed(
            acceptedQuestId,
            quest.templateId,
            user,
            quest.rewardToken,
            rewardAmount,
            quest.expReward
        );

        _afterQuestClaimed(user, acceptedQuestId);
    }

    function _claimStreakReward(address user) internal {
        uint256 pendingReward = pendingStreakRewards[user];
        require(pendingReward > 0, "QuestController: no streak reward");
        require(streakRewardToken != address(0), "QuestController: streak token not set");

        _consumeDailyBudget(streakRewardBudgetGroupId, pendingReward);
        pendingStreakRewards[user] = 0;

        IERC20(streakRewardToken).safeTransfer(user, pendingReward);
        emit StreakRewardClaimed(user, streakRewardToken, pendingReward);
    }

    function _increaseQuestProgress(uint256 acceptedQuestId, QuestTemplate storage template, uint32 amount) internal {
        AcceptedQuest storage quest = acceptedQuests[acceptedQuestId];
        uint256 newProgress = uint256(quest.progress) + amount;
        if (newProgress > type(uint32).max) {
            newProgress = type(uint32).max;
        }

        quest.progress = uint32(newProgress);
        if (!quest.completed && quest.progress >= _requiredTarget(template)) {
            quest.completed = true;
            emit QuestCompleted(acceptedQuestId, quest.user);
        }

        emit QuestProgressUpdated(acceptedQuestId, quest.user, quest.progress, quest.completed);
    }

    function _afterQuestClaimed(address user, uint256 claimedQuestId) internal {
        _cleanupInactiveQuests(user);
        uint256[] storage activeQuestIds = _activeQuestIds[user];
        for (uint256 i = 0; i < activeQuestIds.length; i++) {
            uint256 activeQuestId = activeQuestIds[i];
            if (activeQuestId == claimedQuestId) {
                continue;
            }

            AcceptedQuest storage quest = acceptedQuests[activeQuestId];
            if (quest.claimed || quest.completed || _isExpired(quest)) {
                continue;
            }

            QuestTemplate storage template = _templates[quest.templateId];
            if (template.kind != QuestKind.CompleteNQuestsBeforeDeadline) {
                continue;
            }

            _increaseQuestProgress(activeQuestId, template, 1);
        }
    }

    function _cleanupInactiveQuests(address user) internal {
        uint256[] storage activeQuestIds = _activeQuestIds[user];
        uint256 index;

        while (index < activeQuestIds.length) {
            AcceptedQuest storage quest = acceptedQuests[activeQuestIds[index]];
            if (quest.claimed || (_isExpired(quest) && !quest.completed)) {
                activeQuestIds[index] = activeQuestIds[activeQuestIds.length - 1];
                activeQuestIds.pop();
            } else {
                index++;
            }
        }
    }

    function _removeActiveQuest(address user, uint256 acceptedQuestId) internal {
        uint256[] storage activeQuestIds = _activeQuestIds[user];
        for (uint256 i = 0; i < activeQuestIds.length; i++) {
            if (activeQuestIds[i] == acceptedQuestId) {
                activeQuestIds[i] = activeQuestIds[activeQuestIds.length - 1];
                activeQuestIds.pop();
                return;
            }
        }
    }

    function _resolveDeadline(QuestTemplate storage template, uint64 acceptedAt) internal view returns (uint64 deadline) {
        if (template.completionWindow > 0) {
            return acceptedAt + template.completionWindow;
        }

        if (template.kind == QuestKind.OpenBeforeDeadline || template.kind == QuestKind.CompleteNQuestsBeforeDeadline) {
            require(template.acceptEnd > 0, "QuestController: missing deadline");
        }

        return template.acceptEnd;
    }

    function _resolveConfig(uint256 templateId, address user) internal returns (uint32) {
        uint32[] storage configPool = _templateConfigPools[templateId];
        uint256 randomWord = _randomWord(user, templateId);
        return configPool[randomWord % configPool.length];
    }

    function _resolveTokenId(uint256 templateId, address user) internal returns (uint256) {
        uint256[] storage tokenPool = _templateTokenPools[templateId];
        uint256 randomWord = _randomWord(user, templateId);
        return tokenPool[randomWord % tokenPool.length];
    }

    function _randomWord(address user, uint256 templateId) internal returns (uint256) {
        uint256 cursor = randomNonce[user]++;
        return uint256(
            keccak256(
                abi.encode(block.timestamp, block.prevrandao, user, templateId, cursor, address(this))
            )
        );
    }

    function _burnQuestToken(address user, uint256 tokenId) internal {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = tokenId;
        amounts[0] = 1;
        IQuestItems(items).burnBatchFrom(user, ids, amounts);
    }

    function _resolveBurnReward(QuestTemplate storage template, uint256 tokenId) internal view returns (uint256) {
        uint256 baseValue = IQuestShop(shop).tokenPrice(tokenId);
        require(baseValue > 0, "QuestController: token price missing");
        return (baseValue * (BP_VALUE + template.burnRewardBonusBps)) / BP_VALUE;
    }

    function _applyPerMissionCap(uint256 rewardAmount, uint256 maxRewardPerMission) internal pure returns (uint256) {
        if (maxRewardPerMission == 0 || rewardAmount <= maxRewardPerMission) {
            return rewardAmount;
        }

        return maxRewardPerMission;
    }

    function _consumeDailyBudget(uint32 budgetGroupId, uint256 rewardAmount) internal {
        if (rewardAmount == 0 || budgetGroupId == 0) {
            return;
        }

        uint256 cap = dailyBudgetCap[budgetGroupId];
        if (cap == 0) {
            return;
        }

        uint64 today = uint64(block.timestamp / 1 days);
        uint256 spent = dailyBudgetSpent[budgetGroupId][today];
        require(spent + rewardAmount <= cap, "QuestController: daily budget exceeded");
        dailyBudgetSpent[budgetGroupId][today] = spent + rewardAmount;
    }

    function _requiredTarget(QuestTemplate storage template) internal view returns (uint32) {
        if (template.kind == QuestKind.BatchOpenOnce) {
            return template.target == 0 ? 1 : template.target;
        }

        return template.target;
    }

    function _isExpired(AcceptedQuest storage quest) internal view returns (bool) {
        return quest.deadline > 0 && block.timestamp > quest.deadline;
    }

    function _isBurnQuest(QuestKind kind) internal pure returns (bool) {
        return kind == QuestKind.BurnSpecificToken || kind == QuestKind.BurnRandomTokenFromPool;
    }

    function _requiresTarget(QuestKind kind) internal pure returns (bool) {
        return kind != QuestKind.BurnSpecificToken && kind != QuestKind.BurnRandomTokenFromPool;
    }

    function _useAcceptSignature(address user, uint256 templateId, uint64 deadline, bytes calldata signature) internal {
        _validateDeadline(deadline);

        uint256 nonce = nonces[user];
        bytes32 structHash = keccak256(abi.encode(ACCEPT_QUEST_TYPEHASH, user, templateId, nonce, deadline));
        _consumeSignature(user, structHash, signature);
    }

    function _useClaimSignature(
        address user,
        uint256 acceptedQuestId,
        uint64 deadline,
        bytes calldata signature
    ) internal {
        _validateDeadline(deadline);

        uint256 nonce = nonces[user];
        bytes32 structHash = keccak256(abi.encode(CLAIM_QUEST_TYPEHASH, user, acceptedQuestId, nonce, deadline));
        _consumeSignature(user, structHash, signature);
    }

    function _useClaimStreakSignature(address user, uint64 deadline, bytes calldata signature) internal {
        _validateDeadline(deadline);

        uint256 nonce = nonces[user];
        bytes32 structHash = keccak256(abi.encode(CLAIM_STREAK_TYPEHASH, user, nonce, deadline));
        _consumeSignature(user, structHash, signature);
    }

    function _consumeSignature(address user, bytes32 structHash, bytes calldata signature) internal {
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);
        require(signer == user, "QuestController: invalid signature");
        nonces[user] += 1;
    }

    function _validateDeadline(uint64 deadline) internal view {
        require(deadline >= block.timestamp, "QuestController: signature expired");
    }
}
