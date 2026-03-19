import { describe, it, expect } from 'vitest';
import { CreditScorer } from '../src/credit.js';
import { LLMService } from '../src/llm.js';
import type { CreditReport, PoolStats } from '../src/types.js';

// Mock pool stats for testing
const mockPoolStats: PoolStats = {
  totalAssets: 10000n * 10n ** 6n,
  totalBorrowed: 2000n * 10n ** 6n,
  deployedToAave: 3000n * 10n ** 6n,
  idleBalance: 5000n * 10n ** 6n,
  totalShares: 10000n * 10n ** 6n,
  activeLoanCount: 3n,
};

describe('Credit Scorer', () => {
  it('should score an address with no API keys (fallback)', async () => {
    const scorer = new CreditScorer('', '');
    const report = await scorer.scoreAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

    expect(report.normalizedScore).toBeGreaterThanOrEqual(300);
    expect(report.normalizedScore).toBeLessThanOrEqual(850);
    expect(report.breakdown.walletAge).toBeDefined();
    expect(report.breakdown.txActivity).toBeDefined();
    expect(report.breakdown.balanceHealth).toBeDefined();
  });

  it('should format a credit report', () => {
    const scorer = new CreditScorer('', '');
    const mockReport: CreditReport = {
      address: '0xabc',
      score: 672,
      breakdown: {
        walletAge: { days: 182, points: 100 },
        txActivity: { count: 47, points: 50 },
        usdtVolume: { amount: 12400, points: 100 },
        portfolioDiversity: { tokenCount: 6, points: 60 },
        defiExperience: { positionCount: 2, points: 40 },
        balanceHealth: { points: 100 },
        onChainHistory: { repayments: 1, defaults: 0, points: 25 },
      },
      rawScore: 475,
      normalizedScore: 672,
    };

    const formatted = scorer.formatReport(mockReport);
    expect(formatted).toContain('672/850');
    expect(formatted).toContain('182');
    expect(formatted).toContain('47');
  });

  it('should boost score for repayments', async () => {
    const scorer = new CreditScorer('', '');
    const withoutHistory = await scorer.scoreAddress('0xabc', 0, 0);
    const withRepayments = await scorer.scoreAddress('0xabc', 3, 0);

    expect(withRepayments.breakdown.onChainHistory.points).toBeGreaterThan(
      withoutHistory.breakdown.onChainHistory.points
    );
  });

  it('should penalize score for defaults', async () => {
    const scorer = new CreditScorer('', '');
    const withoutHistory = await scorer.scoreAddress('0xabc', 0, 0);
    const withDefaults = await scorer.scoreAddress('0xabc', 0, 2);

    expect(withDefaults.breakdown.onChainHistory.points).toBeLessThan(
      withoutHistory.breakdown.onChainHistory.points
    );
  });
});

describe('LLM Decision (Template)', () => {
  const llm = new LLMService(); // no API key = template mode

  it('should DENY low score', async () => {
    const report: CreditReport = {
      address: '0xabc',
      score: 380,
      breakdown: {
        walletAge: { days: 5, points: 0 },
        txActivity: { count: 2, points: 0 },
        usdtVolume: { amount: 0, points: 0 },
        portfolioDiversity: { tokenCount: 0, points: 0 },
        defiExperience: { positionCount: 0, points: 0 },
        balanceHealth: { points: 30 },
        onChainHistory: { repayments: 0, defaults: 0, points: 0 },
      },
      rawScore: 30,
      normalizedScore: 380,
    };

    const decision = await llm.decideLoan(
      report,
      { borrower: '0xabc', amount: 100, durationDays: 30 },
      mockPoolStats
    );

    expect(decision.decision).toBe('DENY');
    expect(decision.reasoning).toBeTruthy();
  });

  it('should APPROVE good score', async () => {
    const report: CreditReport = {
      address: '0xabc',
      score: 720,
      breakdown: {
        walletAge: { days: 200, points: 150 },
        txActivity: { count: 100, points: 100 },
        usdtVolume: { amount: 20000, points: 100 },
        portfolioDiversity: { tokenCount: 8, points: 80 },
        defiExperience: { positionCount: 3, points: 60 },
        balanceHealth: { points: 100 },
        onChainHistory: { repayments: 2, defaults: 0, points: 50 },
      },
      rawScore: 640,
      normalizedScore: 720,
    };

    const decision = await llm.decideLoan(
      report,
      { borrower: '0xabc', amount: 200, durationDays: 30 },
      mockPoolStats
    );

    expect(decision.decision).toBe('APPROVE');
    expect(decision.interestRate).toBe(800); // 8% tier
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it('should NEGOTIATE when amount exceeds pool cap', async () => {
    const report: CreditReport = {
      address: '0xabc',
      score: 550,
      breakdown: {
        walletAge: { days: 60, points: 50 },
        txActivity: { count: 20, points: 50 },
        usdtVolume: { amount: 5000, points: 50 },
        portfolioDiversity: { tokenCount: 3, points: 30 },
        defiExperience: { positionCount: 1, points: 20 },
        balanceHealth: { points: 60 },
        onChainHistory: { repayments: 0, defaults: 0, points: 0 },
      },
      rawScore: 260,
      normalizedScore: 550,
    };

    const smallPool: PoolStats = {
      ...mockPoolStats,
      totalAssets: 1000n * 10n ** 6n, // Only 1000 USDT
    };

    const decision = await llm.decideLoan(
      report,
      { borrower: '0xabc', amount: 500, durationDays: 30 }, // 500 > 5% of 1000
      smallPool
    );

    expect(decision.decision).toBe('NEGOTIATE');
    expect(decision.maxAmount).toBeDefined();
  });
});
