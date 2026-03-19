// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CreditRegistry.sol";

contract CreditRegistryTest is Test {
    CreditRegistry registry;
    address owner = address(this);
    address agent = address(0xA1);
    address borrower = address(0xB1);

    function setUp() public {
        registry = new CreditRegistry();
        registry.setAuthorizedUpdater(agent, true);
    }

    function test_initializeProfile() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 500);

        CreditRegistry.CreditProfile memory p = registry.getProfile(borrower);
        assertEq(p.score, 500);
        assertTrue(p.exists);
        assertEq(p.totalLoans, 0);
    }

    function test_initializeProfile_revert_duplicate() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 500);

        vm.prank(agent);
        vm.expectRevert(CreditRegistry.ProfileExists.selector);
        registry.initializeProfile(borrower, 600);
    }

    function test_initializeProfile_revert_invalidScore() public {
        vm.prank(agent);
        vm.expectRevert(CreditRegistry.InvalidScore.selector);
        registry.initializeProfile(borrower, 200); // below MIN_SCORE
    }

    function test_updateScore() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 500);

        vm.prank(agent);
        registry.updateScore(borrower, 700, "improved activity");

        assertEq(registry.getScore(borrower), 700);
    }

    function test_recordRepayment_boosts_score() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 600);

        vm.prank(agent);
        registry.recordRepayment(borrower, 0);

        assertEq(registry.getScore(borrower), 615); // +15
    }

    function test_recordRepayment_caps_at_max() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 845);

        vm.prank(agent);
        registry.recordRepayment(borrower, 0);

        assertEq(registry.getScore(borrower), 850); // capped
    }

    function test_recordDefault_penalizes_score() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 600);

        vm.prank(agent);
        registry.recordDefault(borrower, 0);

        assertEq(registry.getScore(borrower), 500); // -100
    }

    function test_recordDefault_floors_at_min() public {
        vm.prank(agent);
        registry.initializeProfile(borrower, 350);

        vm.prank(agent);
        registry.recordDefault(borrower, 0);

        assertEq(registry.getScore(borrower), 300); // floored
    }

    function test_unauthorized_reverts() public {
        address rando = address(0xDEAD);

        vm.prank(rando);
        vm.expectRevert(CreditRegistry.NotAuthorized.selector);
        registry.initializeProfile(borrower, 500);
    }

    function test_getScore_nonexistent_returns_zero() public view {
        assertEq(registry.getScore(address(0xDEAD)), 0);
    }
}
