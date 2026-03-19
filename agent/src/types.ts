export interface CreditReport {
  address: string;
  score: number;
  breakdown: {
    walletAge: { days: number; points: number };
    txActivity: { count: number; points: number };
    usdtVolume: { amount: number; points: number };
    portfolioDiversity: { tokenCount: number; points: number };
    defiExperience: { positionCount: number; points: number };
    balanceHealth: { points: number };
    onChainHistory: { repayments: number; defaults: number; points: number };
  };
  rawScore: number;
  normalizedScore: number;
}

export interface LoanRequest {
  borrower: string;
  amount: number;       // USDT amount (human readable)
  durationDays: number;
}

export interface LoanDecision {
  decision: 'APPROVE' | 'NEGOTIATE' | 'DENY';
  reasoning: string;
  interestRate: number;   // basis points
  confidence: number;     // 0-100
  maxAmount?: number;     // for NEGOTIATE
  suggestedDuration?: number;
}

export interface PoolStats {
  totalAssets: bigint;
  totalBorrowed: bigint;
  deployedToAave: bigint;
  idleBalance: bigint;
  totalShares: bigint;
  activeLoanCount: bigint;
}

export interface LoanInfo {
  borrower: string;
  principal: bigint;
  rateAPR: bigint;
  startTime: bigint;
  duration: bigint;
  repaidTime: bigint;
  status: number;  // 0=Active, 1=Repaid, 2=Defaulted
  creditScore: number;
  confidence: number;
  reasoning: string;
}

export interface AgentConfig {
  rpcUrl: string;
  privateKey: string;
  usdtAddress: string;
  poolAddress: string;
  registryAddress: string;
  aavePoolAddress?: string;
  etherscanApiKey?: string;
  covalentApiKey?: string;
  anthropicApiKey?: string;
  telegramBotToken?: string;
}
