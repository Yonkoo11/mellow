// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentEscrow.sol";
import "../src/MockUSDT.sol";

contract AgentEscrowTest is Test {
    AgentEscrow escrow;
    MockUSDT usdt;

    address treasury = address(0xFEE);
    address client   = address(0xC1);
    address worker   = address(0xB1);
    address verifier = address(0xD1);

    uint256 constant AMOUNT = 100e6;       // 100 USDT
    uint256 constant FEE_BPS = 100;        // 1%
    uint256 constant FEE = AMOUNT / 100;   // 1 USDT

    function setUp() public {
        usdt = new MockUSDT();
        escrow = new AgentEscrow(treasury, FEE_BPS);

        // Fund client
        usdt.mint(client, 10_000e6);
        vm.prank(client);
        usdt.approve(address(escrow), type(uint256).max);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _taskHash() internal pure returns (bytes32) {
        return keccak256("Analyze top DEX pairs");
    }

    function _createEscrow() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createEscrow(worker, verifier, IERC20(address(usdt)), AMOUNT, _deadline(), _taskHash());
    }

    function _createOpenEscrow() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createEscrow(address(0), verifier, IERC20(address(usdt)), AMOUNT, _deadline(), _taskHash());
    }

    // ═══════════════════════════════════════════
    // Happy path: create → accept → submit → release
    // ═══════════════════════════════════════════

    function test_fullFlow() public {
        uint256 id = _createEscrow();

        // Accept
        vm.prank(worker);
        escrow.acceptEscrow(id);

        // Submit work
        bytes32 result = keccak256("analysis report v1");
        vm.prank(worker);
        escrow.submitWork(id, result);

        // Verify and release
        vm.prank(verifier);
        escrow.verifyAndRelease(id);

        // Check balances
        assertEq(usdt.balanceOf(worker), AMOUNT);
        assertEq(usdt.balanceOf(treasury), FEE);
        assertEq(usdt.balanceOf(address(escrow)), 0);

        // Check state
        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Released));
        assertEq(e.resultHash, result);
    }

    // ═══════════════════════════════════════════
    // Create
    // ═══════════════════════════════════════════

    function test_create_transfersTokens() public {
        uint256 balBefore = usdt.balanceOf(client);
        _createEscrow();
        assertEq(usdt.balanceOf(client), balBefore - AMOUNT - FEE);
        assertEq(usdt.balanceOf(address(escrow)), AMOUNT + FEE);
    }

    function test_create_storesEscrow() public {
        uint256 id = _createEscrow();
        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.client, client);
        assertEq(e.worker, worker);
        assertEq(e.verifier, verifier);
        assertEq(e.amount, AMOUNT);
        assertEq(e.fee, FEE);
        assertEq(e.taskHash, _taskHash());
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Open));
    }

    function test_create_incrementsId() public {
        uint256 id1 = _createEscrow();
        uint256 id2 = _createEscrow();
        assertEq(id1, 0);
        assertEq(id2, 1);
    }

    function test_create_revertsZeroAmount() public {
        vm.prank(client);
        vm.expectRevert(AgentEscrow.ZeroAmount.selector);
        escrow.createEscrow(worker, verifier, IERC20(address(usdt)), 0, _deadline(), _taskHash());
    }

    function test_create_revertsDeadlineInPast() public {
        vm.prank(client);
        vm.expectRevert(AgentEscrow.DeadlineTooSoon.selector);
        escrow.createEscrow(worker, verifier, IERC20(address(usdt)), AMOUNT, uint64(block.timestamp), _taskHash());
    }

    // ═══════════════════════════════════════════
    // Accept
    // ═══════════════════════════════════════════

    function test_accept_setsWorker() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Accepted));
        assertEq(e.worker, worker);
    }

    function test_accept_openBounty() public {
        uint256 id = _createOpenEscrow();
        address rando = address(0x999);

        vm.prank(rando);
        escrow.acceptEscrow(id);

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.worker, rando);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Accepted));
    }

    function test_accept_revertsWrongWorker() public {
        uint256 id = _createEscrow();
        vm.prank(address(0x999));
        vm.expectRevert(AgentEscrow.NotWorker.selector);
        escrow.acceptEscrow(id);
    }

    function test_accept_revertsDoubleAccept() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);

        vm.prank(worker);
        vm.expectRevert(AgentEscrow.WrongStatus.selector);
        escrow.acceptEscrow(id);
    }

    function test_accept_revertsAfterDeadline() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(worker);
        vm.expectRevert(AgentEscrow.DeadlinePassed.selector);
        escrow.acceptEscrow(id);
    }

    // ═══════════════════════════════════════════
    // Submit
    // ═══════════════════════════════════════════

    function test_submit_setsResultHash() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);

        bytes32 result = keccak256("report");
        vm.prank(worker);
        escrow.submitWork(id, result);

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.resultHash, result);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Submitted));
    }

    function test_submit_revertsNotWorker() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);

        vm.prank(client);
        vm.expectRevert(AgentEscrow.NotWorker.selector);
        escrow.submitWork(id, keccak256("fake"));
    }

    function test_submit_revertsWrongStatus() public {
        uint256 id = _createEscrow();
        // Still Open, not Accepted
        vm.prank(worker);
        vm.expectRevert(AgentEscrow.WrongStatus.selector);
        escrow.submitWork(id, keccak256("report"));
    }

    // ═══════════════════════════════════════════
    // Verify & Release
    // ═══════════════════════════════════════════

    function test_release_revertsNotVerifier() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));

        vm.prank(client);
        vm.expectRevert(AgentEscrow.NotVerifier.selector);
        escrow.verifyAndRelease(id);
    }

    function test_release_revertsWrongStatus() public {
        uint256 id = _createEscrow();
        // Still Open
        vm.prank(verifier);
        vm.expectRevert(AgentEscrow.WrongStatus.selector);
        escrow.verifyAndRelease(id);
    }

    // ═══════════════════════════════════════════
    // Dispute
    // ═══════════════════════════════════════════

    function test_dispute_byClient() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));

        bytes32 reason = keccak256("work is incomplete");
        vm.prank(client);
        escrow.dispute(id, reason);

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Disputed));
    }

    function test_dispute_byWorker() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));

        vm.prank(worker);
        escrow.dispute(id, keccak256("client unresponsive"));

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Disputed));
    }

    function test_dispute_revertsThirdParty() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));

        vm.prank(address(0x999));
        vm.expectRevert(AgentEscrow.NotClient.selector);
        escrow.dispute(id, keccak256("spam"));
    }

    // ═══════════════════════════════════════════
    // Resolve Dispute
    // ═══════════════════════════════════════════

    function test_resolve_releaseToWorker() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));
        vm.prank(client);
        escrow.dispute(id, keccak256("bad work"));

        vm.prank(verifier);
        escrow.resolveDispute(id, true);

        assertEq(usdt.balanceOf(worker), AMOUNT);
        assertEq(usdt.balanceOf(treasury), FEE);
        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Released));
    }

    function test_resolve_refundToClient() public {
        uint256 clientBalBefore = usdt.balanceOf(client);
        uint256 id = _createEscrow();

        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));
        vm.prank(client);
        escrow.dispute(id, keccak256("bad work"));

        vm.prank(verifier);
        escrow.resolveDispute(id, false);

        assertEq(usdt.balanceOf(client), clientBalBefore);  // fully refunded
        assertEq(usdt.balanceOf(worker), 0);
        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Refunded));
    }

    function test_resolve_revertsNotVerifier() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));
        vm.prank(client);
        escrow.dispute(id, keccak256("bad"));

        vm.prank(client);
        vm.expectRevert(AgentEscrow.NotVerifier.selector);
        escrow.resolveDispute(id, true);
    }

    // ═══════════════════════════════════════════
    // Refund (timeout)
    // ═══════════════════════════════════════════

    function test_refund_afterDeadline_open() public {
        uint256 clientBalBefore = usdt.balanceOf(client);
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 2 hours);

        vm.prank(client);
        escrow.refund(id);

        assertEq(usdt.balanceOf(client), clientBalBefore);  // fully refunded
        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Refunded));
    }

    function test_refund_afterDeadline_accepted() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(client);
        escrow.refund(id);

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AgentEscrow.Status.Refunded));
    }

    function test_refund_revertsBeforeDeadline() public {
        uint256 id = _createEscrow();
        vm.prank(client);
        vm.expectRevert(AgentEscrow.DeadlineNotPassed.selector);
        escrow.refund(id);
    }

    function test_refund_revertsAfterSubmitted() public {
        uint256 id = _createEscrow();
        vm.prank(worker);
        escrow.acceptEscrow(id);
        vm.prank(worker);
        escrow.submitWork(id, keccak256("report"));
        vm.warp(block.timestamp + 2 hours);

        vm.prank(client);
        vm.expectRevert(AgentEscrow.WrongStatus.selector);
        escrow.refund(id);
    }

    function test_refund_revertsNotClient() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 2 hours);

        vm.prank(worker);
        vm.expectRevert(AgentEscrow.NotClient.selector);
        escrow.refund(id);
    }

    // ═══════════════════════════════════════════
    // Fee math
    // ═══════════════════════════════════════════

    function test_fee_calculation() public {
        vm.prank(client);
        uint256 id = escrow.createEscrow(worker, verifier, IERC20(address(usdt)), 333e6, _deadline(), _taskHash());

        AgentEscrow.Escrow memory e = escrow.getEscrow(id);
        // 333 * 100 / 10000 = 3.33 USDT = 3_330_000
        assertEq(e.fee, 3_330_000);
    }

    function test_fee_zeroWhenFeeBpsZero() public {
        AgentEscrow noFeeEscrow = new AgentEscrow(treasury, 0);
        usdt.mint(client, 1000e6);
        vm.prank(client);
        usdt.approve(address(noFeeEscrow), type(uint256).max);

        vm.prank(client);
        uint256 id = noFeeEscrow.createEscrow(worker, verifier, IERC20(address(usdt)), AMOUNT, _deadline(), _taskHash());

        AgentEscrow.Escrow memory e = noFeeEscrow.getEscrow(id);
        assertEq(e.fee, 0);
    }

    // ═══════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════

    function test_admin_setFeeBps() public {
        escrow.setFeeBps(200); // 2%
        assertEq(escrow.feeBps(), 200);
    }

    function test_admin_setTreasury() public {
        escrow.setTreasury(address(0xBEEF));
        assertEq(escrow.treasury(), address(0xBEEF));
    }

    function test_admin_revertsNotOwner() public {
        vm.prank(client);
        vm.expectRevert(AgentEscrow.NotOwner.selector);
        escrow.setFeeBps(200);
    }
}
