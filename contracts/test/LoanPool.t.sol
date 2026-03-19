// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LoanPool.sol";
import "../src/CreditRegistry.sol";
import "../src/MockUSDT.sol";

contract LoanPoolTest is Test {
    LoanPool pool;
    CreditRegistry registry;
    MockUSDT usdt;

    address owner = address(this);
    address agent = address(0xA1);
    address lender1 = address(0x1111);
    address borrower1 = address(0xB1);

    function setUp() public {
        usdt = new MockUSDT();
        registry = new CreditRegistry();
        pool = new LoanPool(address(usdt), address(registry), agent);

        // Authorize pool to update credit registry
        registry.setAuthorizedUpdater(address(pool), true);
        registry.setAuthorizedUpdater(agent, true);

        // Initialize borrower credit profile
        vm.prank(agent);
        registry.initializeProfile(borrower1, 650);

        // Fund lender
        usdt.mint(lender1, 10_000e6);
        vm.prank(lender1);
        usdt.approve(address(pool), type(uint256).max);

        // Fund borrower for repayments
        usdt.mint(borrower1, 1_000e6);
        vm.prank(borrower1);
        usdt.approve(address(pool), type(uint256).max);
    }

    // --- Deposit ---
    function test_deposit() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        (uint256 shares, uint256 value) = pool.getLenderInfo(lender1);
        assertEq(shares, 1000e6);
        assertEq(value, 1000e6);
        assertEq(pool.totalShares(), 1000e6);
    }

    function test_deposit_zeroReverts() public {
        vm.prank(lender1);
        vm.expectRevert(LoanPool.ZeroAmount.selector);
        pool.deposit(0);
    }

    // --- Withdraw ---
    function test_withdraw() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(lender1);
        pool.withdraw(500e6);

        (uint256 shares,) = pool.getLenderInfo(lender1);
        assertEq(shares, 500e6);
        assertEq(usdt.balanceOf(lender1), 9500e6); // started with 10k, deposited 1k, withdrew 500
    }

    function test_withdraw_insufficientShares() public {
        vm.prank(lender1);
        pool.deposit(100e6);

        vm.prank(lender1);
        vm.expectRevert(LoanPool.InsufficientShares.selector);
        pool.withdraw(200e6);
    }

    // --- Create Loan ---
    function test_createLoan() public {
        // Deposit first
        vm.prank(lender1);
        pool.deposit(1000e6);

        // Agent creates loan
        vm.prank(agent);
        pool.createLoan(
            borrower1,
            200e6,
            800, // 8% APR
            30 days,
            "Good credit history, approved at standard rate",
            650,
            85
        );

        LoanPool.Loan memory loan = pool.getLoan(0);
        assertEq(loan.borrower, borrower1);
        assertEq(loan.principal, 200e6);
        assertEq(loan.rateAPR, 800);
        assertEq(uint8(loan.status), uint8(LoanPool.LoanStatus.Active));
        assertEq(loan.creditScore, 650);

        // Borrower received USDT
        assertEq(usdt.balanceOf(borrower1), 1200e6); // 1000 initial + 200 loan
    }

    function test_createLoan_onlyAgent() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(lender1);
        vm.expectRevert(LoanPool.OnlyAgent.selector);
        pool.createLoan(borrower1, 100e6, 800, 30 days, "test", 650, 85);
    }

    function test_createLoan_scoreTooLow() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        vm.expectRevert(LoanPool.ScoreTooLow.selector);
        pool.createLoan(borrower1, 100e6, 800, 30 days, "test", 400, 85);
    }

    function test_createLoan_amountTooHigh() public {
        vm.prank(lender1);
        pool.deposit(5000e6);

        vm.prank(agent);
        vm.expectRevert(LoanPool.AmountTooHigh.selector);
        pool.createLoan(borrower1, 2000e6, 800, 30 days, "test", 650, 85);
    }

    // --- Repay ---
    function test_repay() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        pool.createLoan(borrower1, 200e6, 800, 30 days, "approved", 650, 85);

        // Fast forward 30 days
        vm.warp(block.timestamp + 30 days);

        uint256 owed = pool.getAmountOwed(0);
        assertTrue(owed > 200e6); // should include interest

        vm.prank(borrower1);
        pool.repay(0, owed);

        LoanPool.Loan memory loan = pool.getLoan(0);
        assertEq(uint8(loan.status), uint8(LoanPool.LoanStatus.Repaid));

        // Credit score should have increased
        assertEq(registry.getScore(borrower1), 665); // 650 + 15
    }

    // --- Default ---
    function test_markDefault() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        pool.createLoan(borrower1, 200e6, 800, 30 days, "approved", 650, 85);

        // Fast forward past due + grace period
        vm.warp(block.timestamp + 30 days + 7 days + 1);

        vm.prank(agent);
        pool.markDefault(0);

        LoanPool.Loan memory loan = pool.getLoan(0);
        assertEq(uint8(loan.status), uint8(LoanPool.LoanStatus.Defaulted));

        // Credit score should have decreased
        assertEq(registry.getScore(borrower1), 550); // 650 - 100
    }

    function test_markDefault_notOverdue() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        pool.createLoan(borrower1, 200e6, 800, 30 days, "approved", 650, 85);

        // Only 15 days in - not overdue yet
        vm.warp(block.timestamp + 15 days);

        vm.prank(agent);
        vm.expectRevert(LoanPool.LoanNotOverdue.selector);
        pool.markDefault(0);
    }

    // --- Interest Calculation ---
    function test_getAmountOwed_interest() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        pool.createLoan(borrower1, 1000e6, 1000, 365 days, "approved", 650, 85);

        // After 1 year at 10% APR
        vm.warp(block.timestamp + 365 days);

        uint256 owed = pool.getAmountOwed(0);
        // Should be ~1100 USDT (1000 + 10% interest)
        assertApproxEqAbs(owed, 1100e6, 1e6); // within $1
    }

    // --- Pool Stats ---
    function test_poolStats() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        (uint256 _totalAssets,,,,uint256 _totalShares,) = pool.getPoolStats();
        assertEq(_totalAssets, 1000e6);
        assertEq(_totalShares, 1000e6);
    }

    // --- Borrower Loans ---
    function test_getBorrowerLoans() public {
        vm.prank(lender1);
        pool.deposit(1000e6);

        vm.prank(agent);
        pool.createLoan(borrower1, 100e6, 800, 30 days, "loan 1", 650, 85);

        vm.prank(agent);
        pool.createLoan(borrower1, 200e6, 800, 30 days, "loan 2", 650, 85);

        uint256[] memory loanIds = pool.getBorrowerLoans(borrower1);
        assertEq(loanIds.length, 2);
        assertEq(loanIds[0], 0);
        assertEq(loanIds[1], 1);
    }
}
