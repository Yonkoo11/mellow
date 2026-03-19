import { ethers } from 'ethers';
import { LOAN_POOL_ABI, CREDIT_REGISTRY_ABI, ERC20_ABI } from './constants.js';
import type { PoolStats, LoanInfo, AgentConfig } from './types.js';

export class PoolService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private pool: ethers.Contract;
  private registry: ethers.Contract;
  private usdt: ethers.Contract;

  constructor(config: AgentConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.pool = new ethers.Contract(config.poolAddress, LOAN_POOL_ABI, this.signer);
    this.registry = new ethers.Contract(config.registryAddress, CREDIT_REGISTRY_ABI, this.signer);
    this.usdt = new ethers.Contract(config.usdtAddress, ERC20_ABI, this.signer);
  }

  get address() { return this.signer.address; }

  // --- Pool Operations ---
  async deposit(amount: bigint): Promise<ethers.TransactionReceipt> {
    const allowance = await this.usdt.allowance(this.signer.address, await this.pool.getAddress());
    if (allowance < amount) {
      const approveTx = await this.usdt.approve(await this.pool.getAddress(), ethers.MaxUint256);
      await approveTx.wait();
    }
    const tx = await this.pool.deposit(amount);
    return tx.wait();
  }

  async withdraw(shares: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.pool.withdraw(shares);
    return tx.wait();
  }

  async createLoan(
    borrower: string,
    amount: bigint,
    rateAPR: number,
    durationSeconds: number,
    reasoning: string,
    score: number,
    confidence: number
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.pool.createLoan(
      borrower, amount, rateAPR, durationSeconds, reasoning, score, confidence
    );
    return tx.wait();
  }

  async repay(loanId: number, amount: bigint): Promise<ethers.TransactionReceipt> {
    // Ensure approval
    const allowance = await this.usdt.allowance(this.signer.address, await this.pool.getAddress());
    if (allowance < amount) {
      const approveTx = await this.usdt.approve(await this.pool.getAddress(), ethers.MaxUint256);
      await approveTx.wait();
    }
    const tx = await this.pool.repay(loanId, amount);
    return tx.wait();
  }

  async markDefault(loanId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.pool.markDefault(loanId);
    return tx.wait();
  }

  async deployToAave(amount: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.pool.deployToAave(amount);
    return tx.wait();
  }

  async withdrawFromAave(amount: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.pool.withdrawFromAave(amount);
    return tx.wait();
  }

  // --- View Functions ---
  async getPoolStats(): Promise<PoolStats> {
    const [totalAssets, totalBorrowed, deployedToAave, idleBalance, totalShares, activeLoanCount] =
      await this.pool.getPoolStats();
    return { totalAssets, totalBorrowed, deployedToAave, idleBalance, totalShares, activeLoanCount };
  }

  async getLoan(loanId: number): Promise<LoanInfo> {
    const loan = await this.pool.getLoan(loanId);
    return {
      borrower: loan.borrower,
      principal: loan.principal,
      rateAPR: loan.rateAPR,
      startTime: loan.startTime,
      duration: loan.duration,
      repaidTime: loan.repaidTime,
      status: loan.status,
      creditScore: loan.creditScore,
      confidence: loan.confidence,
      reasoning: loan.reasoning,
    };
  }

  async getAmountOwed(loanId: number): Promise<bigint> {
    return this.pool.getAmountOwed(loanId);
  }

  async getLenderInfo(address: string): Promise<{ shares: bigint; value: bigint }> {
    const [shares, value] = await this.pool.getLenderInfo(address);
    return { shares, value };
  }

  async getBorrowerLoans(address: string): Promise<number[]> {
    const ids: bigint[] = await this.pool.getBorrowerLoans(address);
    return ids.map(id => Number(id));
  }

  async getNextLoanId(): Promise<number> {
    return Number(await this.pool.nextLoanId());
  }

  async getIdleBalance(): Promise<bigint> {
    return this.pool.getIdleBalance();
  }

  // --- Credit Registry ---
  async initializeProfile(borrower: string, score: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.registry.initializeProfile(borrower, score);
    return tx.wait();
  }

  async getCreditScore(borrower: string): Promise<number> {
    return Number(await this.registry.getScore(borrower));
  }

  async getProfile(borrower: string) {
    return this.registry.getProfile(borrower);
  }

  // --- Token ---
  async getUsdtBalance(address: string): Promise<bigint> {
    return this.usdt.balanceOf(address);
  }

  async mintTestUsdt(to: string, amount: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.usdt.mint(to, amount);
    return tx.wait();
  }
}
