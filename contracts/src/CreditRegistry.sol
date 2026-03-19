// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CreditRegistry - On-chain credit scores for Mellow lending
contract CreditRegistry is Ownable {
    uint16 public constant MIN_SCORE = 300;
    uint16 public constant MAX_SCORE = 850;
    uint16 public constant REPAYMENT_BOOST = 15;
    uint16 public constant DEFAULT_PENALTY = 100;

    struct CreditProfile {
        uint16 score;
        uint32 totalLoans;
        uint32 repaidLoans;
        uint32 defaultedLoans;
        uint64 lastUpdated;
        bool exists;
    }

    mapping(address => CreditProfile) public profiles;
    mapping(address => bool) public authorizedUpdaters;

    event ProfileInitialized(address indexed borrower, uint16 score);
    event ScoreUpdated(address indexed borrower, uint16 oldScore, uint16 newScore, string reason);
    event RepaymentRecorded(address indexed borrower, uint256 loanId, uint16 newScore);
    event DefaultRecorded(address indexed borrower, uint256 loanId, uint16 newScore);
    event UpdaterAuthorized(address indexed updater, bool status);

    error NotAuthorized();
    error ProfileExists();
    error ProfileNotFound();
    error InvalidScore();

    modifier onlyAuthorized() {
        if (!authorizedUpdaters[msg.sender] && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    constructor() Ownable(msg.sender) {
        authorizedUpdaters[msg.sender] = true;
    }

    function setAuthorizedUpdater(address updater, bool status) external onlyOwner {
        authorizedUpdaters[updater] = status;
        emit UpdaterAuthorized(updater, status);
    }

    function initializeProfile(address borrower, uint16 initialScore) external onlyAuthorized {
        if (profiles[borrower].exists) revert ProfileExists();
        if (initialScore < MIN_SCORE || initialScore > MAX_SCORE) revert InvalidScore();

        profiles[borrower] = CreditProfile({
            score: initialScore,
            totalLoans: 0,
            repaidLoans: 0,
            defaultedLoans: 0,
            lastUpdated: uint64(block.timestamp),
            exists: true
        });

        emit ProfileInitialized(borrower, initialScore);
    }

    function updateScore(address borrower, uint16 newScore, string calldata reason) external onlyAuthorized {
        if (!profiles[borrower].exists) revert ProfileNotFound();
        if (newScore < MIN_SCORE || newScore > MAX_SCORE) revert InvalidScore();

        uint16 oldScore = profiles[borrower].score;
        profiles[borrower].score = newScore;
        profiles[borrower].lastUpdated = uint64(block.timestamp);

        emit ScoreUpdated(borrower, oldScore, newScore, reason);
    }

    function recordRepayment(address borrower, uint256 loanId) external onlyAuthorized {
        if (!profiles[borrower].exists) revert ProfileNotFound();

        CreditProfile storage profile = profiles[borrower];
        profile.repaidLoans++;
        uint16 newScore = profile.score + REPAYMENT_BOOST;
        if (newScore > MAX_SCORE) newScore = MAX_SCORE;
        profile.score = newScore;
        profile.lastUpdated = uint64(block.timestamp);

        emit RepaymentRecorded(borrower, loanId, newScore);
    }

    function recordDefault(address borrower, uint256 loanId) external onlyAuthorized {
        if (!profiles[borrower].exists) revert ProfileNotFound();

        CreditProfile storage profile = profiles[borrower];
        profile.defaultedLoans++;
        uint16 newScore;
        if (profile.score <= MIN_SCORE + DEFAULT_PENALTY) {
            newScore = MIN_SCORE;
        } else {
            newScore = profile.score - DEFAULT_PENALTY;
        }
        profile.score = newScore;
        profile.lastUpdated = uint64(block.timestamp);

        emit DefaultRecorded(borrower, loanId, newScore);
    }

    function getProfile(address borrower) external view returns (CreditProfile memory) {
        return profiles[borrower];
    }

    function getScore(address borrower) external view returns (uint16) {
        if (!profiles[borrower].exists) return 0;
        return profiles[borrower].score;
    }
}
