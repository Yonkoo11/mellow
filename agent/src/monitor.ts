import type { PoolService } from './pool.js';
import type { LoanInfo } from './types.js';

export class RepaymentMonitor {
  private pool: PoolService;
  private gracePeriodSeconds: number;

  constructor(pool: PoolService, gracePeriodDays = 7) {
    this.pool = pool;
    this.gracePeriodSeconds = gracePeriodDays * 86400;
  }

  async checkOverdueLoans(): Promise<{
    reminders: Array<{ loanId: number; borrower: string; daysUntilDue: number; amountOwed: bigint }>;
    defaults: Array<{ loanId: number; borrower: string; daysOverdue: number }>;
  }> {
    const reminders: Array<{ loanId: number; borrower: string; daysUntilDue: number; amountOwed: bigint }> = [];
    const defaults: Array<{ loanId: number; borrower: string; daysOverdue: number }> = [];

    const nextId = await this.pool.getNextLoanId();
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (let i = 0; i < nextId; i++) {
      const loan = await this.pool.getLoan(i);
      if (loan.status !== 0) continue; // not Active

      const dueTime = loan.startTime + loan.duration;
      const defaultTime = dueTime + BigInt(this.gracePeriodSeconds);

      if (now > defaultTime) {
        // Past grace period - mark default
        defaults.push({
          loanId: i,
          borrower: loan.borrower,
          daysOverdue: Number((now - dueTime) / 86400n),
        });
      } else if (now > dueTime - 259200n) {
        // Within 3 days of due date - send reminder
        const daysUntilDue = Number((dueTime - now) / 86400n);
        const amountOwed = await this.pool.getAmountOwed(i);
        reminders.push({
          loanId: i,
          borrower: loan.borrower,
          daysUntilDue: Math.max(0, daysUntilDue),
          amountOwed,
        });
      }
    }

    return { reminders, defaults };
  }

  async processDefaults(): Promise<number[]> {
    const { defaults } = await this.checkOverdueLoans();
    const processed: number[] = [];

    for (const d of defaults) {
      try {
        await this.pool.markDefault(d.loanId);
        processed.push(d.loanId);
        console.log(`Marked loan ${d.loanId} as defaulted (${d.daysOverdue} days overdue)`);
      } catch (err) {
        console.error(`Failed to mark loan ${d.loanId} as defaulted:`, err);
      }
    }

    return processed;
  }
}
