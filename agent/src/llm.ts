import Anthropic from '@anthropic-ai/sdk';
import { CREDIT_TIERS } from './constants.js';
import type { CreditReport, LoanRequest, LoanDecision, PoolStats } from './types.js';

const LLM_CONFIG = {
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 300,
  timeoutMs: 15_000,
};

export class LLMService {
  private client: Anthropic | null;
  private enabled: boolean;

  constructor(apiKey?: string) {
    this.enabled = !!apiKey;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async decideLoan(
    report: CreditReport,
    request: LoanRequest,
    poolStats: PoolStats
  ): Promise<LoanDecision> {
    // Template fallback if LLM unavailable
    if (!this.enabled || !this.client) {
      return this.templateDecision(report, request, poolStats);
    }

    try {
      return await this.withTimeout(
        this.llmDecision(report, request, poolStats),
        LLM_CONFIG.timeoutMs
      );
    } catch (err) {
      console.warn('LLM decision failed, using template:', err);
      return this.templateDecision(report, request, poolStats);
    }
  }

  private async llmDecision(
    report: CreditReport,
    request: LoanRequest,
    poolStats: PoolStats
  ): Promise<LoanDecision> {
    const utilization = poolStats.totalAssets > 0n
      ? Number((poolStats.totalBorrowed * 100n) / poolStats.totalAssets)
      : 0;

    const prompt = `You are Mellow, an autonomous AI lending agent. Analyze this loan application and decide.

BORROWER CREDIT REPORT:
- Score: ${report.normalizedScore}/850
- Wallet Age: ${report.breakdown.walletAge.days} days
- TX Count: ${report.breakdown.txActivity.count}
- USDT Volume (30d): $${report.breakdown.usdtVolume.amount}
- Token Diversity: ${report.breakdown.portfolioDiversity.tokenCount}
- DeFi Positions: ${report.breakdown.defiExperience.positionCount}
- Repayments: ${report.breakdown.onChainHistory.repayments}, Defaults: ${report.breakdown.onChainHistory.defaults}

LOAN REQUEST:
- Amount: ${request.amount} USDT
- Duration: ${request.durationDays} days

POOL STATE:
- Total Assets: ${Number(poolStats.totalAssets) / 1e6} USDT
- Utilization: ${utilization}%
- Idle Balance: ${Number(poolStats.idleBalance) / 1e6} USDT

DECISION GUIDELINES:
- Score 750-850: Approve at 5% APR, max 10% of pool
- Score 650-749: Approve at 8% APR, max 7% of pool
- Score 550-649: Approve at 12% APR, max 5% of pool
- Score 450-549: Negotiate at 15% APR, max 3% of pool
- Score 300-449: Deny

Respond with ONLY valid JSON:
{"decision":"APPROVE|NEGOTIATE|DENY","reasoning":"2-3 sentence explanation","interestRate":800,"confidence":85}`;

    const response = await this.client!.messages.create({
      model: LLM_CONFIG.model,
      max_tokens: LLM_CONFIG.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      decision: parsed.decision,
      reasoning: parsed.reasoning,
      interestRate: parsed.interestRate,
      confidence: parsed.confidence || 75,
      maxAmount: parsed.maxAmount,
      suggestedDuration: parsed.suggestedDuration,
    };
  }

  private templateDecision(
    report: CreditReport,
    request: LoanRequest,
    poolStats: PoolStats
  ): LoanDecision {
    const score = report.normalizedScore;
    const tier = CREDIT_TIERS.find(t => score >= t.minScore && score <= t.maxScore);

    if (!tier || tier.decision === 'DENY') {
      return {
        decision: 'DENY',
        reasoning: `Credit score ${score} is below the minimum threshold of 450. Insufficient on-chain history to extend credit.`,
        interestRate: 0,
        confidence: 90,
      };
    }

    const maxLoanFromPool = poolStats.totalAssets > 0n
      ? Number(poolStats.totalAssets * BigInt(tier.maxPoolPct) / 100n) / 1e6
      : 0;

    if (request.amount > maxLoanFromPool) {
      return {
        decision: 'NEGOTIATE',
        reasoning: `Requested ${request.amount} USDT exceeds ${tier.maxPoolPct}% pool cap (${maxLoanFromPool.toFixed(0)} USDT). Offering reduced amount.`,
        interestRate: tier.rate,
        confidence: 80,
        maxAmount: maxLoanFromPool,
      };
    }

    const b = report.breakdown;
    return {
      decision: tier.decision,
      reasoning: `${b.walletAge.days} days of activity with ${b.txActivity.count} transactions. Score ${score} qualifies for ${tier.rate / 100}% APR tier.`,
      interestRate: tier.rate,
      confidence: 85,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), ms)
      ),
    ]);
  }
}
