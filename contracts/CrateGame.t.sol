// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {InfiniteChest} from "./InfiniteChest.sol";
import {CrateGameItems} from "./NFTs/CrateGameItems.sol";
import {Shop} from "./Shop.sol";
import {Key} from "./Tokens/key.sol";
import {Treasury} from "./Treasury.sol";
import {UserStats} from "./userStats.sol";

contract CrateGameTest is Test {
    uint256 internal constant INITIAL_SUPPLY = 1_000_000 ether;
    uint256 internal constant PLAYER_FUNDS = 100 ether;
    uint256 internal constant CHEST_PRICE = 10 ether;

    Treasury internal treasury;
    Key internal key;
    CrateGameItems internal items;
    Shop internal shop;
    InfiniteChest internal infiniteChest;
    UserStats internal userStats;

    address internal player;
    address internal referrer;
    uint32 internal configId;
    uint256[] internal tokenIds;

    function setUp() public {
        player = makeAddr("player");
        referrer = makeAddr("referrer");

        treasury = new Treasury();
        key = new Key(INITIAL_SUPPLY);
        items = new CrateGameItems(address(this));
        userStats = new UserStats();
        shop = new Shop(address(treasury), address(key), address(items), address(0));
        infiniteChest = new InfiniteChest(address(treasury), address(items), address(shop), address(userStats));

        shop.setInfiniteChest(address(infiniteChest));
        items.setMinter(address(infiniteChest));

        treasury.setPermittedAddress(address(infiniteChest), true);
        treasury.setPermittedAddress(address(shop), true);
        treasury.setUserStats(address(userStats));
        infiniteChest.setPermittedCaller(player, true);
        userStats.setPermittedCaller(address(infiniteChest), true);

        key.transfer(player, PLAYER_FUNDS);

        uint64[] memory weights = new uint64[](5);
        weights[0] = 3000;
        weights[1] = 2000;
        weights[2] = 3000;
        weights[3] = 1500;
        weights[4] = 500;

        uint64[] memory multipliers = new uint64[](5);
        multipliers[0] = 6000;
        multipliers[1] = 8000;
        multipliers[2] = 10_000;
        multipliers[3] = 12_000;
        multipliers[4] = 16_000;

        tokenIds.push(1);
        tokenIds.push(2);
        tokenIds.push(3);
        tokenIds.push(4);
        tokenIds.push(5);

        configId = infiniteChest.addConfig(address(key), CHEST_PRICE, weights, multipliers, tokenIds);
    }

    function test_OpenChestChargesAndMintsOneItem() public {
        vm.prank(player);
        key.approve(address(treasury), CHEST_PRICE);

        uint256 playerBefore = key.balanceOf(player);
        uint256 treasuryBefore = key.balanceOf(address(treasury));

        vm.prank(player);
        infiniteChest.open(configId);

        require(
            key.balanceOf(player) == playerBefore - CHEST_PRICE,
            "player token balance should decrease by chest price"
        );
        require(
            key.balanceOf(address(treasury)) == treasuryBefore + CHEST_PRICE,
            "treasury token balance should increase by chest price"
        );

        uint256 mintedCount;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 balance = items.balanceOf(player, tokenIds[i]);
            require(balance <= 1, "only one item id should be minted");
            if (balance == 1) {
                mintedCount++;
            }
        }

        require(mintedCount == 1, "exactly one item id should be minted");
    }

    function test_OpenAndSetReferrer_PaysRewardAndLocksReferrer() public {
        vm.prank(player);
        key.approve(address(treasury), CHEST_PRICE);

        uint256 bps = treasury.referralRewardBps();
        uint256 expectedReward = (CHEST_PRICE * bps) / 10_000;

        uint256 treasuryBefore = key.balanceOf(address(treasury));
        uint256 referrerBefore = key.balanceOf(referrer);

        vm.prank(player);
        infiniteChest.openAndSetReferrer(configId, referrer);

        require(userStats.getReferrer(player) == referrer, "referrer should be stored");
        require(
            key.balanceOf(address(treasury)) == treasuryBefore + (CHEST_PRICE - expectedReward),
            "treasury should receive net amount"
        );
        require(
            key.balanceOf(referrer) == referrerBefore + expectedReward,
            "referrer should receive reward"
        );

        address anotherReferrer = makeAddr("anotherReferrer");
        vm.prank(player);
        vm.expectRevert("referrer already set");
        infiniteChest.openAndSetReferrer(configId, anotherReferrer);
    }

    function test_OpenWithReferrer_RewardAppliesOnEveryOpen() public {
        vm.prank(player);
        key.approve(address(treasury), CHEST_PRICE * 2);

        uint256 bps = treasury.referralRewardBps();
        uint256 expectedReward = (CHEST_PRICE * bps) / 10_000;

        vm.prank(player);
        infiniteChest.openAndSetReferrer(configId, referrer);

        uint256 treasuryAfterFirst = key.balanceOf(address(treasury));
        uint256 referrerAfterFirst = key.balanceOf(referrer);

        vm.prank(player);
        infiniteChest.open(configId);

        require(
            key.balanceOf(address(treasury)) == treasuryAfterFirst + (CHEST_PRICE - expectedReward),
            "treasury should keep receiving net amount on each open"
        );
        require(
            key.balanceOf(referrer) == referrerAfterFirst + expectedReward,
            "referrer should receive reward on each open"
        );
    }

    function test_OpenWithoutReferrer_SendsFullAmountToTreasury() public {
        vm.prank(player);
        key.approve(address(treasury), CHEST_PRICE);

        uint256 treasuryBefore = key.balanceOf(address(treasury));
        uint256 referrerBefore = key.balanceOf(referrer);

        vm.prank(player);
        infiniteChest.open(configId);

        require(
            key.balanceOf(address(treasury)) == treasuryBefore + CHEST_PRICE,
            "treasury should receive full amount when no referrer"
        );
        require(
            key.balanceOf(referrer) == referrerBefore,
            "referrer should not receive any reward if not set"
        );
    }

    function test_SetReferralRewardBps_UpdatesTreasuryAndPayout() public {
        infiniteChest.setReferralRewardBps(100); // 1%
        require(treasury.referralRewardBps() == 100, "treasury bps should sync with chest");

        vm.prank(player);
        key.approve(address(treasury), CHEST_PRICE);

        uint256 expectedReward = (CHEST_PRICE * 100) / 10_000;
        uint256 treasuryBefore = key.balanceOf(address(treasury));
        uint256 referrerBefore = key.balanceOf(referrer);

        vm.prank(player);
        infiniteChest.openAndSetReferrer(configId, referrer);

        require(
            key.balanceOf(address(treasury)) == treasuryBefore + (CHEST_PRICE - expectedReward),
            "treasury should receive updated net amount"
        );
        require(
            key.balanceOf(referrer) == referrerBefore + expectedReward,
            "referrer reward should use updated bps"
        );
    }

    function test_OpenRejectsWhenCallerNotPermitted() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert("not permitted");
        infiniteChest.open(configId);
    }
}
