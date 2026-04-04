// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract UserStats is Ownable {
    struct UserData {
        uint256 totalChestsOpened;
        uint256 keyIn;
        uint256 referredCount;
        uint256 referrerReward;
        address referrer;
        bytes32 key;
        bool manualKeySet;
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

    constructor() Ownable(msg.sender) {}

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
}
