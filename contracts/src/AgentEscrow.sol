// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentEscrow - Trustless escrow for agent-to-agent commerce
/// @notice Agents lock tokens, workers deliver, verifiers release. No humans in the loop.
contract AgentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Accepted, Submitted, Released, Disputed, Refunded }

    struct Escrow {
        address client;
        address worker;
        address verifier;
        IERC20  token;
        uint256 amount;
        uint256 fee;
        uint64  deadline;
        bytes32 taskHash;
        bytes32 resultHash;
        Status  status;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextId;
    uint256 public feeBps;     // 100 = 1%
    address public treasury;
    address public owner;

    // --- Events ---
    event Created(uint256 indexed id, address indexed client, address worker, uint256 amount, bytes32 taskHash);
    event Accepted(uint256 indexed id, address indexed worker);
    event WorkSubmitted(uint256 indexed id, bytes32 resultHash);
    event Released(uint256 indexed id, address indexed worker, uint256 amount);
    event Disputed(uint256 indexed id, address indexed by, bytes32 reason);
    event DisputeResolved(uint256 indexed id, bool releasedToWorker);
    event Refunded(uint256 indexed id, address indexed client, uint256 amount);

    // --- Errors ---
    error NotClient();
    error NotWorker();
    error NotVerifier();
    error NotOwner();
    error WrongStatus();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error DeadlineTooSoon();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _treasury, uint256 _feeBps) {
        owner = msg.sender;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    // --- Core Flow ---

    function createEscrow(
        address worker,
        address verifier,
        IERC20  token,
        uint256 amount,
        uint64  deadline,
        bytes32 taskHash
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineTooSoon();

        uint256 fee = (amount * feeBps) / 10000;
        id = nextId++;

        escrows[id] = Escrow({
            client:     msg.sender,
            worker:     worker,        // address(0) = open bounty
            verifier:   verifier,
            token:      token,
            amount:     amount,
            fee:        fee,
            deadline:   deadline,
            taskHash:   taskHash,
            resultHash: bytes32(0),
            status:     Status.Open
        });

        token.safeTransferFrom(msg.sender, address(this), amount + fee);
        emit Created(id, msg.sender, worker, amount, taskHash);
    }

    function acceptEscrow(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Open) revert WrongStatus();
        if (e.worker != address(0) && e.worker != msg.sender) revert NotWorker();
        if (block.timestamp >= e.deadline) revert DeadlinePassed();

        e.worker = msg.sender;
        e.status = Status.Accepted;
        emit Accepted(id, msg.sender);
    }

    function submitWork(uint256 id, bytes32 resultHash) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Accepted) revert WrongStatus();
        if (msg.sender != e.worker) revert NotWorker();

        e.resultHash = resultHash;
        e.status = Status.Submitted;
        emit WorkSubmitted(id, resultHash);
    }

    function verifyAndRelease(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status != Status.Submitted) revert WrongStatus();
        if (msg.sender != e.verifier) revert NotVerifier();

        e.status = Status.Released;
        e.token.safeTransfer(e.worker, e.amount);
        if (e.fee > 0) e.token.safeTransfer(treasury, e.fee);
        emit Released(id, e.worker, e.amount);
    }

    function dispute(uint256 id, bytes32 reason) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Submitted) revert WrongStatus();
        if (msg.sender != e.client && msg.sender != e.worker) revert NotClient();

        e.status = Status.Disputed;
        emit Disputed(id, msg.sender, reason);
    }

    function resolveDispute(uint256 id, bool releaseToWorker) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status != Status.Disputed) revert WrongStatus();
        if (msg.sender != e.verifier) revert NotVerifier();

        if (releaseToWorker) {
            e.status = Status.Released;
            e.token.safeTransfer(e.worker, e.amount);
            if (e.fee > 0) e.token.safeTransfer(treasury, e.fee);
        } else {
            e.status = Status.Refunded;
            e.token.safeTransfer(e.client, e.amount + e.fee);
        }
        emit DisputeResolved(id, releaseToWorker);
    }

    function refund(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (msg.sender != e.client) revert NotClient();
        // Can only refund Open or Accepted — not after work is submitted
        if (e.status != Status.Open && e.status != Status.Accepted) revert WrongStatus();
        if (block.timestamp < e.deadline) revert DeadlineNotPassed();

        e.status = Status.Refunded;
        e.token.safeTransfer(e.client, e.amount + e.fee);
        emit Refunded(id, e.client, e.amount + e.fee);
    }

    // --- Views ---

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return escrows[id];
    }

    // --- Admin ---

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        feeBps = _feeBps;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
