// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CreditRegistry.sol";

/// @title IAavePool - Minimal Aave V3 Pool interface
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// @title LoanPool - Autonomous AI lending pool
contract LoanPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // --- Types ---
    enum LoanStatus { Active, Repaid, Defaulted }

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 rateAPR;       // basis points (500 = 5%)
        uint64 startTime;
        uint64 duration;       // seconds
        uint64 repaidTime;
        LoanStatus status;
        uint16 creditScore;
        uint8 confidence;
        string reasoning;
    }

    struct LenderInfo {
        uint256 shares;
        uint256 depositedAmount;
    }

    // --- State ---
    IERC20 public immutable usdt;
    CreditRegistry public immutable creditRegistry;
    IAavePool public aavePool;

    address public agent;
    uint256 public totalShares;
    uint256 public totalDeposited;
    uint256 public totalBorrowed;
    uint256 public deployedToAave;
    uint256 public nextLoanId;

    uint256 public maxLoanAmount;    // max single loan
    uint16 public minCreditScore;    // minimum score to get a loan
    uint64 public gracePeriod;       // seconds after due date before default

    mapping(uint256 => Loan) public loans;
    mapping(address => LenderInfo) public lenders;
    mapping(address => uint256[]) public borrowerLoans;

    // --- Events ---
    event Deposited(address indexed lender, uint256 amount, uint256 shares);
    event Withdrawn(address indexed lender, uint256 amount, uint256 shares);
    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 rateAPR, string reasoning);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower);
    event DeployedToAave(uint256 amount);
    event WithdrawnFromAave(uint256 amount);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);

    // --- Errors ---
    error OnlyAgent();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientShares();
    error LoanNotActive();
    error LoanNotOverdue();
    error ScoreTooLow();
    error AmountTooHigh();
    error NoAavePool();

    modifier onlyAgent() {
        if (msg.sender != agent) revert OnlyAgent();
        _;
    }

    constructor(
        address _usdt,
        address _creditRegistry,
        address _agent
    ) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        creditRegistry = CreditRegistry(_creditRegistry);
        agent = _agent;
        maxLoanAmount = 1000e6;     // 1000 USDT
        minCreditScore = 450;       // minimum score for any loan
        gracePeriod = 7 days;
    }

    // --- Admin ---
    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    function setAavePool(address _aavePool) external onlyOwner {
        aavePool = IAavePool(_aavePool);
    }

    function setMaxLoanAmount(uint256 _max) external onlyOwner {
        maxLoanAmount = _max;
    }

    function setMinCreditScore(uint16 _min) external onlyOwner {
        minCreditScore = _min;
    }

    // --- Lender Operations ---
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 sharesToMint;
        if (totalShares == 0) {
            sharesToMint = amount;
        } else {
            sharesToMint = (amount * totalShares) / totalAssets();
        }

        usdt.safeTransferFrom(msg.sender, address(this), amount);
        lenders[msg.sender].shares += sharesToMint;
        lenders[msg.sender].depositedAmount += amount;
        totalShares += sharesToMint;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount, sharesToMint);
    }

    function withdraw(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (lenders[msg.sender].shares < shares) revert InsufficientShares();

        uint256 amount = (shares * totalAssets()) / totalShares;
        uint256 available = usdt.balanceOf(address(this));
        if (amount > available) revert InsufficientBalance();

        lenders[msg.sender].shares -= shares;
        totalShares -= shares;
        totalDeposited = totalDeposited > amount ? totalDeposited - amount : 0;

        usdt.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, shares);
    }

    // --- Agent Loan Operations ---
    function createLoan(
        address borrower,
        uint256 amount,
        uint256 rateAPR,
        uint64 duration,
        string calldata reasoning,
        uint16 score,
        uint8 confidence
    ) external onlyAgent nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > maxLoanAmount) revert AmountTooHigh();
        if (score < minCreditScore) revert ScoreTooLow();
        if (amount > usdt.balanceOf(address(this))) revert InsufficientBalance();

        uint256 loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: borrower,
            principal: amount,
            rateAPR: rateAPR,
            startTime: uint64(block.timestamp),
            duration: duration,
            repaidTime: 0,
            status: LoanStatus.Active,
            creditScore: score,
            confidence: confidence,
            reasoning: reasoning
        });
        borrowerLoans[borrower].push(loanId);
        totalBorrowed += amount;

        usdt.safeTransfer(borrower, amount);

        emit LoanCreated(loanId, borrower, amount, rateAPR, reasoning);
    }

    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.Active) revert LoanNotActive();

        uint256 owed = getAmountOwed(loanId);
        uint256 payment = amount > owed ? owed : amount;

        usdt.safeTransferFrom(msg.sender, address(this), payment);

        if (payment >= owed) {
            loan.status = LoanStatus.Repaid;
            loan.repaidTime = uint64(block.timestamp);
            totalBorrowed -= loan.principal;
            creditRegistry.recordRepayment(loan.borrower, loanId);
        }

        emit LoanRepaid(loanId, loan.borrower, payment);
    }

    function markDefault(uint256 loanId) external onlyAgent {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.Active) revert LoanNotActive();
        if (block.timestamp < loan.startTime + loan.duration + gracePeriod) revert LoanNotOverdue();

        loan.status = LoanStatus.Defaulted;
        totalBorrowed -= loan.principal;
        creditRegistry.recordDefault(loan.borrower, loanId);

        emit LoanDefaulted(loanId, loan.borrower);
    }

    // --- Aave Yield ---
    function deployToAave(uint256 amount) external onlyAgent nonReentrant {
        if (address(aavePool) == address(0)) revert NoAavePool();
        if (amount > usdt.balanceOf(address(this))) revert InsufficientBalance();

        usdt.approve(address(aavePool), amount);
        aavePool.supply(address(usdt), amount, address(this), 0);
        deployedToAave += amount;

        emit DeployedToAave(amount);
    }

    function withdrawFromAave(uint256 amount) external onlyAgent nonReentrant {
        if (address(aavePool) == address(0)) revert NoAavePool();

        uint256 withdrawn = aavePool.withdraw(address(usdt), amount, address(this));
        deployedToAave = deployedToAave > withdrawn ? deployedToAave - withdrawn : 0;

        emit WithdrawnFromAave(withdrawn);
    }

    // --- View Functions ---
    function getAmountOwed(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.Active) return 0;

        uint256 elapsed = block.timestamp - loan.startTime;
        // Simple interest: principal * rate * time / (365 days * 10000)
        uint256 interest = (loan.principal * loan.rateAPR * elapsed) / (365 days * 10000);
        return loan.principal + interest;
    }

    function totalAssets() public view returns (uint256) {
        return usdt.balanceOf(address(this)) + totalBorrowed + deployedToAave;
    }

    function getIdleBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function getPoolStats() external view returns (
        uint256 _totalAssets,
        uint256 _totalBorrowed,
        uint256 _deployedToAave,
        uint256 _idleBalance,
        uint256 _totalShares,
        uint256 _activeLoanCount
    ) {
        _totalAssets = totalAssets();
        _totalBorrowed = totalBorrowed;
        _deployedToAave = deployedToAave;
        _idleBalance = usdt.balanceOf(address(this));
        _totalShares = totalShares;
        _activeLoanCount = nextLoanId; // simplified; includes all statuses
    }

    function getLenderInfo(address lender) external view returns (uint256 shares, uint256 value) {
        shares = lenders[lender].shares;
        value = totalShares > 0 ? (shares * totalAssets()) / totalShares : 0;
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }
}
