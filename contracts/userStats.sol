// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract UserStats is Ownable {
    struct UserData {
        uint256 totalChestsOpened;
        uint256 keyIn;
        uint256 referredCount;
        uint256 referrerReward;
        uint256 exp;
        address referrer;
        bytes32 key;
        bool manualKeySet;
        uint64 lastActiveDay;
        uint32 currentStreak;
        uint32 bestStreak;
    }

    mapping(address => UserData) private _users;
    mapping(address => bool) public permittedCallers;

    event PermittedCallerSet(address indexed account, bool allowed);
    event UserKeyInitialized(address indexed user, bytes32 key);
    event UserKeyUpdated(address indexed user, bytes32 key, bool manual);
    event UserChestsIncremented(address indexed user, uint256 amount, uint256 totalChestsOpened);
    event ReferrerSet(address indexed user, address indexed referrer);
    event UserOpenRecorded(address indexed user, uint256 keySpent, uint256 totalChestsOpened, uint256 totalKeyIn);
    event UserOpenBatchRecorded(
        address indexed user,
        uint256 opens,
        uint256 keySpent,
        uint256 totalChestsOpened,
        uint256 totalKeyIn
    );
    event ReferrerRewardRecorded(address indexed referrer, uint256 reward, uint256 totalReward);
    event UserExpAdded(address indexed user, uint256 amount, uint256 totalExp);
    event DailyActivityRecorded(
        address indexed user,
        uint64 indexed day,
        uint32 currentStreak,
        uint32 bestStreak,
        bool milestoneReached
    );

    constructor(address owner_) Ownable(owner_) {}

    modifier onlyPermittedOrOwner() {
        require(permittedCallers[msg.sender] || msg.sender == owner(), "UserStats: not permitted");
        _;
    }

    function setPermittedCaller(address account, bool allowed) external onlyOwner {
        permittedCallers[account] = allowed;
        emit PermittedCallerSet(account, allowed);
    }

    function setMyKey(bytes32 newKey) external {
        require(newKey != bytes32(0), "UserStats: invalid key");

        UserData storage user = _users[msg.sender];
        user.key = newKey;
        user.manualKeySet = true;

        emit UserKeyUpdated(msg.sender, newKey, true);
    }

    function incrementChests(address user, uint256 amount) external onlyPermittedOrOwner {
        require(user != address(0), "UserStats: invalid user");
        require(amount > 0, "UserStats: invalid amount");

        _ensureKey(user);

        UserData storage userData = _users[user];
        userData.totalChestsOpened += amount;

        emit UserChestsIncremented(user, amount, userData.totalChestsOpened);
    }

    function setReferrer(address user, address referrer) external onlyPermittedOrOwner {
        require(user != address(0), "UserStats: invalid user");
        require(referrer != address(0), "UserStats: invalid referrer");
        require(user != referrer, "UserStats: self referrer");

        UserData storage userData = _users[user];
        require(userData.referrer == address(0), "UserStats: referrer already set");

        userData.referrer = referrer;
        _users[referrer].referredCount += 1;

        emit ReferrerSet(user, referrer);
    }

    function recordOpen(address user, uint256 keySpent) external onlyPermittedOrOwner {
        require(user != address(0), "UserStats: invalid user");
        require(keySpent > 0, "UserStats: invalid key amount");

        _ensureKey(user);

        UserData storage userData = _users[user];
        userData.totalChestsOpened += 1;
        userData.keyIn += keySpent;

        emit UserOpenRecorded(user, keySpent, userData.totalChestsOpened, userData.keyIn);
    }

    function recordOpenBatch(address user, uint256 opens, uint256 keySpent) external onlyPermittedOrOwner {
        require(user != address(0), "UserStats: invalid user");
        require(opens > 0, "UserStats: invalid opens");
        require(keySpent > 0, "UserStats: invalid key amount");

        _ensureKey(user);

        UserData storage userData = _users[user];
        userData.totalChestsOpened += opens;
        userData.keyIn += keySpent;

        emit UserOpenBatchRecorded(user, opens, keySpent, userData.totalChestsOpened, userData.keyIn);
    }

    function recordReferrerReward(address referrer, uint256 reward) external onlyPermittedOrOwner {
        require(referrer != address(0), "UserStats: invalid referrer");
        require(reward > 0, "UserStats: invalid reward");

        UserData storage referrerData = _users[referrer];
        referrerData.referrerReward += reward;

        emit ReferrerRewardRecorded(referrer, reward, referrerData.referrerReward);
    }

    function addExp(address user, uint256 amount) external onlyPermittedOrOwner {
        require(user != address(0), "UserStats: invalid user");
        require(amount > 0, "UserStats: invalid exp amount");

        _ensureKey(user);

        UserData storage userData = _users[user];
        userData.exp += amount;

        emit UserExpAdded(user, amount, userData.exp);
    }

    function recordDailyActivity(
        address user
    ) external onlyPermittedOrOwner returns (bool countedToday, uint32 currentStreak, bool milestoneReached) {
        require(user != address(0), "UserStats: invalid user");

        _ensureKey(user);

        UserData storage userData = _users[user];
        uint64 today = _currentDay();

        if (userData.currentStreak > 0 && userData.lastActiveDay == today) {
            return (false, userData.currentStreak, false);
        }

        if (userData.currentStreak > 0 && userData.lastActiveDay + 1 == today) {
            currentStreak = userData.currentStreak + 1;
        } else {
            currentStreak = 1;
        }

        userData.lastActiveDay = today;
        userData.currentStreak = currentStreak;

        if (currentStreak > userData.bestStreak) {
            userData.bestStreak = currentStreak;
        }

        milestoneReached = currentStreak % 7 == 0;
        emit DailyActivityRecorded(user, today, currentStreak, userData.bestStreak, milestoneReached);

        return (true, currentStreak, milestoneReached);
    }

    function ensureMyKey() external returns (bytes32 key) {
        key = _ensureKey(msg.sender);
    }

    function ensureUserKey(address user) external onlyPermittedOrOwner returns (bytes32 key) {
        require(user != address(0), "UserStats: invalid user");
        key = _ensureKey(user);
    }

    function getUser(address user) external view returns (uint256 totalChestsOpened, bytes32 key, bool manualKeySet) {
        UserData storage userData = _users[user];
        return (userData.totalChestsOpened, userData.key, userData.manualKeySet);
    }

    function getReferrer(address user) external view returns (address) {
        return _users[user].referrer;
    }

    function getUserKey(address user) external view returns (bytes32) {
        return _users[user].key;
    }

    function expOf(address user) external view returns (uint256) {
        return _users[user].exp;
    }

    function levelOf(address user) external view returns (uint32) {
        return _levelFromExp(_users[user].exp);
    }

    function streakOf(address user) external view returns (uint32 currentStreak, uint32 bestStreak, uint64 lastActiveDay) {
        UserData storage userData = _users[user];
        return (userData.currentStreak, userData.bestStreak, userData.lastActiveDay);
    }

    function expRequiredForLevel(uint32 level) external pure returns (uint256) {
        return _expRequiredForLevel(level);
    }

    function getUserDashboard(address user) external view returns (
        uint256 exp,
        uint32 level,
        uint32 currentStreak,
        uint32 bestStreak,
        uint64 lastActiveDay,
        uint256 expForNextLevel,
        uint256 totalChestsOpened
    ) {
        UserData storage u = _users[user];
        exp = u.exp;
        level = _levelFromExp(exp);
        currentStreak = u.currentStreak;
        bestStreak = u.bestStreak;
        lastActiveDay = u.lastActiveDay;
        expForNextLevel = _expRequiredForLevel(level + 1);
        totalChestsOpened = u.totalChestsOpened;
    }

    function _ensureKey(address user) internal returns (bytes32 key) {
        UserData storage userData = _users[user];

        if (userData.key != bytes32(0)) {
            key = userData.key;
            
        } else {
            // Default key when user did not set one manually.
            key = keccak256(abi.encode(user, block.timestamp, block.prevrandao));
            userData.key = key;
            emit UserKeyInitialized(user, key);
            emit UserKeyUpdated(user, key, false);
        }
    }

    function _currentDay() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _expRequiredForLevel(uint32 level) internal pure returns (uint256) {
        if (level <= 1) {
            return 0;
        }

        uint256 levelsGained = uint256(level) - 1;
        return (levelsGained * 100) + ((3 * levelsGained * (levelsGained - 1)) / 2);
    }

    function _levelFromExp(uint256 exp) internal pure returns (uint32 level) {
        if (exp < 100) {
            return 1;
        }

        uint256 root = Math.sqrt((197 * 197) + (24 * exp));
        uint256 levelsGained;
        if (root > 197) {
            levelsGained = (root - 197) / 6;
        }

        level = uint32(levelsGained + 1);
        while (_expRequiredForLevel(level + 1) <= exp) {
            level++;
        }
    }
}
