import { ethers } from 'ethers';
import { PoolService } from './pool.js';
import { CreditScorer } from './credit.js';
import { LLMService } from './llm.js';
import { RepaymentMonitor } from './monitor.js';
import type { AgentConfig, LoanRequest, LoanDecision, CreditReport, PoolStats } from './types.js';

export class MellowAgent {
  private pool: PoolService;
  private scorer: CreditScorer;
  private llm: LLMService;
  private monitor: RepaymentMonitor;
  private config: AgentConfig;

  // Circuit breaker
  private consecutiveFailures = 0;
  private readonly MAX_FAILURES = 3;

  constructor(config: AgentConfig) {
    this.config = config;
    this.pool = new PoolService(config);
    this.scorer = new CreditScorer(
      config.etherscanApiKey || '',
      config.covalentApiKey || ''
    );
    this.llm = new LLMService(config.anthropicApiKey);
    this.monitor = new RepaymentMonitor(this.pool);
  }

  get agentAddress() { return this.pool.address; }

  // --- Core Actions ---

  async processLoanApplication(request: LoanRequest): Promise<{
    report: CreditReport;
    decision: LoanDecision;
    txHash?: string;
  }> {
    this.checkCircuitBreaker();

    try {
      // 1. Get on-chain credit history
      const profile = await this.pool.getProfile(request.borrower);
      const repayments = profile.exists ? Number(profile.repaidLoans) : 0;
      const defaults = profile.exists ? Number(profile.defaultedLoans) : 0;

      // 2. Score the borrower
      const report = await this.scorer.scoreAddress(request.borrower, repayments, defaults);

      // 3. Initialize on-chain profile if new
      if (!profile.exists) {
        await this.pool.initializeProfile(request.borrower, report.normalizedScore);
      }

      // 4. Get pool stats for decision context
      const poolStats = await this.pool.getPoolStats();

      // 5. LLM decision
      const decision = await this.llm.decideLoan(report, request, poolStats);

      // 6. Execute if approved
      let txHash: string | undefined;
      if (decision.decision === 'APPROVE') {
        const amountWei = ethers.parseUnits(request.amount.toString(), 6);
        const durationSec = request.durationDays * 86400;

        const receipt = await this.pool.createLoan(
          request.borrower,
          amountWei,
          decision.interestRate,
          durationSec,
          decision.reasoning,
          report.normalizedScore,
          decision.confidence
        );
        txHash = receipt.hash;
      }

      this.consecutiveFailures = 0;
      return { report, decision, txHash };
    } catch (err) {
      this.consecutiveFailures++;
      throw err;
    }
  }

  async handleDeposit(lender: string, amount: number): Promise<string> {
    const amountWei = ethers.parseUnits(amount.toString(), 6);
    // For demo: mint test USDT and deposit
    await this.pool.mintTestUsdt(lender, amountWei);
    const receipt = await this.pool.deposit(amountWei);
    return receipt.hash;
  }

  async handleRepayment(borrower: string, loanId: number): Promise<string> {
    const owed = await this.pool.getAmountOwed(loanId);
    const receipt = await this.pool.repay(loanId, owed);
    return receipt.hash;
  }

  async getPoolSummary(): Promise<string> {
    const stats = await this.pool.getPoolStats();
    const idle = Number(stats.idleBalance) / 1e6;
    const total = Number(stats.totalAssets) / 1e6;
    const borrowed = Number(stats.totalBorrowed) / 1e6;
    const aave = Number(stats.deployedToAave) / 1e6;
    const utilization = total > 0 ? ((borrowed / total) * 100).toFixed(1) : '0.0';

    return [
      `MELLOW POOL STATUS`,
      `Total Assets:    $${total.toFixed(2)} USDT`,
      `Idle Balance:    $${idle.toFixed(2)} USDT`,
      `Active Loans:    $${borrowed.toFixed(2)} USDT`,
      `Aave Yield:      $${aave.toFixed(2)} USDT`,
      `Utilization:     ${utilization}%`,
      `Total Loans:     ${stats.activeLoanCount.toString()}`,
    ].join('\n');
  }

  async getCreditReport(address: string): Promise<string> {
    const profile = await this.pool.getProfile(address);
    const repayments = profile.exists ? Number(profile.repaidLoans) : 0;
    const defaults = profile.exists ? Number(profile.defaultedLoans) : 0;
    const report = await this.scorer.scoreAddress(address, repayments, defaults);
    return this.scorer.formatReport(report);
  }

  async checkAndProcessDefaults(): Promise<string[]> {
    const { reminders, defaults } = await this.monitor.checkOverdueLoans();

    // Process defaults
    const defaulted = await this.monitor.processDefaults();

    // Return reminder messages
    const messages: string[] = [];
    for (const r of reminders) {
      messages.push(
        `Reminder: Loan #${r.loanId} due in ${r.daysUntilDue} days. Amount owed: $${(Number(r.amountOwed) / 1e6).toFixed(2)} USDT`
      );
    }
    for (const id of defaulted) {
      messages.push(`Loan #${id} has been marked as DEFAULTED.`);
    }

    return messages;
  }

  async deployIdleToAave(minAmount = 100e6): Promise<string | null> {
    const idle = await this.pool.getIdleBalance();
    if (idle < BigInt(minAmount)) return null;

    // Keep 20% buffer for upcoming loans
    const deployAmount = (idle * 80n) / 100n;
    try {
      const receipt = await this.pool.deployToAave(deployAmount);
      return `Deployed $${(Number(deployAmount) / 1e6).toFixed(2)} USDT to Aave V3. Tx: ${receipt.hash}`;
    } catch (err) {
      console.warn('Aave deployment failed (likely no pool configured):', err);
      return null;
    }
  }

  // --- Helpers ---
  formatDecision(report: CreditReport, decision: LoanDecision, request: LoanRequest): string {
    const reportStr = this.scorer.formatReport(report);

    if (decision.decision === 'DENY') {
      return [
        `Analyzing your credit profile...\n`,
        reportStr,
        `\nDECISION: DENIED`,
        `\nReasoning: "${decision.reasoning}"`,
      ].join('\n');
    }

    const dueDate = new Date(Date.now() + request.durationDays * 86400 * 1000);
    const totalOwed = request.amount * (1 + (decision.interestRate / 10000) * (request.durationDays / 365));

    return [
      `Analyzing your credit profile...\n`,
      reportStr,
      `\nDECISION: ${decision.decision}`,
      `Amount: ${decision.decision === 'NEGOTIATE' && decision.maxAmount ? decision.maxAmount.toFixed(0) : request.amount} USDT`,
      `Rate: ${(decision.interestRate / 100).toFixed(1)}% APR | Duration: ${request.durationDays} days`,
      `Due: ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      `Total owed: ${totalOwed.toFixed(2)} USDT`,
      `\nReasoning: "${decision.reasoning}"`,
      decision.decision === 'APPROVE'
        ? `\nType /confirm to accept these terms and receive funds.`
        : `\nType /confirm to accept the negotiated terms.`,
    ].join('\n');
  }

  private checkCircuitBreaker() {
    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      throw new Error(`Circuit breaker open: ${this.consecutiveFailures} consecutive failures. Waiting for reset.`);
    }
  }
}
