// Contract addresses - updated after deployment
export const ADDRESSES = {
  usdt: process.env.USDT_ADDRESS || '',
  pool: process.env.POOL_ADDRESS || '',
  registry: process.env.REGISTRY_ADDRESS || '',
  aavePool: process.env.AAVE_POOL_ADDRESS || '',
};

// Credit scoring thresholds
export const CREDIT_TIERS = [
  { minScore: 750, maxScore: 850, rate: 500,  maxPoolPct: 10, decision: 'APPROVE' as const },
  { minScore: 650, maxScore: 749, rate: 800,  maxPoolPct: 7,  decision: 'APPROVE' as const },
  { minScore: 550, maxScore: 649, rate: 1200, maxPoolPct: 5,  decision: 'APPROVE' as const },
  { minScore: 450, maxScore: 549, rate: 1500, maxPoolPct: 3,  decision: 'NEGOTIATE' as const },
  { minScore: 300, maxScore: 449, rate: 0,    maxPoolPct: 0,  decision: 'DENY' as const },
];

export const SCORING = {
  MIN_SCORE: 300,
  MAX_SCORE: 850,
  // Wallet age points
  AGE_BRACKETS: [
    { days: 365, points: 150 },
    { days: 90, points: 100 },
    { days: 30, points: 50 },
    { days: 0, points: 0 },
  ],
  // TX count points
  TX_BRACKETS: [
    { count: 200, points: 150 },
    { count: 50, points: 100 },
    { count: 10, points: 50 },
    { count: 0, points: 0 },
  ],
  // USDT volume (30d) points
  VOLUME_BRACKETS: [
    { amount: 50_000, points: 150 },
    { amount: 10_000, points: 100 },
    { amount: 1_000, points: 50 },
    { amount: 0, points: 0 },
  ],
  DIVERSITY_PTS_PER_TOKEN: 10,
  DIVERSITY_MAX: 100,
  DEFI_PTS_PER_POSITION: 20,
  DEFI_MAX: 100,
  BALANCE_ETH_THRESHOLD: 0.1,
  BALANCE_ETH_PTS: 30,
  BALANCE_USDT_PTS: 30,
  BALANCE_NO_LIQUIDATION_PTS: 40,
  REPAYMENT_PTS: 25,
  DEFAULT_PTS: -50,
  HISTORY_MAX: 100,
};

// ABIs (minimal for ethers interaction)
export const LOAN_POOL_ABI = [
  'function deposit(uint256 amount)',
  'function withdraw(uint256 shares)',
  'function createLoan(address borrower, uint256 amount, uint256 rateAPR, uint64 duration, string reasoning, uint16 score, uint8 confidence)',
  'function repay(uint256 loanId, uint256 amount)',
  'function markDefault(uint256 loanId)',
  'function deployToAave(uint256 amount)',
  'function withdrawFromAave(uint256 amount)',
  'function getAmountOwed(uint256 loanId) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function getIdleBalance() view returns (uint256)',
  'function getPoolStats() view returns (uint256, uint256, uint256, uint256, uint256, uint256)',
  'function getLenderInfo(address) view returns (uint256 shares, uint256 value)',
  'function getBorrowerLoans(address) view returns (uint256[])',
  'function getLoan(uint256) view returns (tuple(address borrower, uint256 principal, uint256 rateAPR, uint64 startTime, uint64 duration, uint64 repaidTime, uint8 status, uint16 creditScore, uint8 confidence, string reasoning))',
  'function nextLoanId() view returns (uint256)',
  'event Deposited(address indexed lender, uint256 amount, uint256 shares)',
  'event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 rateAPR, string reasoning)',
  'event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount)',
  'event LoanDefaulted(uint256 indexed loanId, address indexed borrower)',
];

export const CREDIT_REGISTRY_ABI = [
  'function initializeProfile(address borrower, uint16 initialScore)',
  'function updateScore(address borrower, uint16 newScore, string reason)',
  'function getProfile(address) view returns (tuple(uint16 score, uint32 totalLoans, uint32 repaidLoans, uint32 defaultedLoans, uint64 lastUpdated, bool exists))',
  'function getScore(address) view returns (uint16)',
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
];
