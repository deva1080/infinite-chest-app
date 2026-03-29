// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUserStats {
    function getReferrer(address user) external view returns (address);
}

contract Treasury is Ownable {
    using SafeERC20 for IERC20;
    uint16 internal constant BP_VALUE = 10_000;

    mapping(address account => bool allowed) public permittedAddress;
    address public userStats;
    uint16 public referralRewardBps = 50;

    event PermittedAddressSet(address indexed account, bool allowed);
    event UserStatsSet(address indexed userStats);
    event ReferralRewardBpsSet(uint16 previousBps, uint16 newBps);
    event Deposited(address indexed caller, address indexed from, address indexed token, uint256 amount);
    event ReferralPaid(
        address indexed caller,
        address indexed from,
        address indexed referrer,
        address token,
        uint256 amount
    );
    event Withdrawn(address indexed caller, address indexed to, address indexed token, uint256 amount);

    modifier onlyPermitted() {
        require(permittedAddress[msg.sender] || msg.sender == owner(), "not permitted");
        _;
    }

    constructor() Ownable(msg.sender) {
        permittedAddress[msg.sender] = true;
        emit PermittedAddressSet(msg.sender, true);
    }

    function setPermittedAddress(address account, bool allowed) external onlyPermitted {
        permittedAddress[account] = allowed;
        emit PermittedAddressSet(account, allowed);
    }

    function setUserStats(address userStats_) external onlyPermitted {
        userStats = userStats_;
        emit UserStatsSet(userStats_);
    }

    function setReferralRewardBps(uint16 newBps) external onlyPermitted {
        require(newBps <= BP_VALUE, "invalid bps");
        uint16 previousBps = referralRewardBps;
        referralRewardBps = newBps;
        emit ReferralRewardBpsSet(previousBps, newBps);
    }

    function deposit(
        address token,
        address from,
        uint256 amount
    ) external onlyPermitted returns (address referrer, uint256 referrerAmount, uint256 treasuryAmount) {
        (referrer, referrerAmount, treasuryAmount) = _getReferralSplit(from, amount);

        if (treasuryAmount > 0) {
            IERC20(token).safeTransferFrom(from, address(this), treasuryAmount);
            emit Deposited(msg.sender, from, token, treasuryAmount);
        }

        if (referrerAmount > 0) {
            IERC20(token).safeTransferFrom(from, referrer, referrerAmount);
            emit ReferralPaid(msg.sender, from, referrer, token, referrerAmount);
        }
        return (referrer, referrerAmount, treasuryAmount);
    }

    function withdraw(address token, address to, uint256 amount) external onlyPermitted {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, token, amount);
    }

    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _getReferralSplit(
        address from,
        uint256 totalAmount
    ) internal view returns (address referrer, uint256 referrerAmount, uint256 treasuryAmount) {
        treasuryAmount = totalAmount;

        if (totalAmount == 0 || userStats == address(0) || referralRewardBps == 0) {
            return (address(0), 0, treasuryAmount);
        }

        referrer = IUserStats(userStats).getReferrer(from);
        if (referrer == address(0)) {
            return (address(0), 0, treasuryAmount);
        }

        referrerAmount = (totalAmount * referralRewardBps) / BP_VALUE;
        treasuryAmount = totalAmount - referrerAmount;
    }
}
