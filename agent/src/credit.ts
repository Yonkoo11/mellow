import { SCORING } from './constants.js';
import type { CreditReport } from './types.js';

interface EtherscanTxListResponse {
  status: string;
  result: Array<{ timeStamp: string; from: string; to: string; value: string }>;
}

interface EtherscanBalanceResponse {
  status: string;
  result: string;
}

function bracketScore(value: number, brackets: { days?: number; count?: number; amount?: number; points: number }[]): number {
  for (const b of brackets) {
    const threshold = b.days ?? b.count ?? b.amount ?? 0;
    if (value >= threshold) return b.points;
  }
  return 0;
}

export class CreditScorer {
  private etherscanKey: string;
  private covalentKey: string;
  private etherscanBase: string;

  constructor(etherscanApiKey: string, covalentApiKey: string, chainId: number = 11155111) {
    this.etherscanKey = etherscanApiKey;
    this.covalentKey = covalentApiKey;
    // Sepolia vs mainnet
    this.etherscanBase = chainId === 1
      ? 'https://api.etherscan.io/api'
      : 'https://api-sepolia.etherscan.io/api';
  }

  async scoreAddress(address: string, onChainRepayments = 0, onChainDefaults = 0): Promise<CreditReport> {
    const [walletData, tokenData] = await Promise.all([
      this.getWalletData(address),
      this.getTokenData(address),
    ]);

    const breakdown = {
      walletAge: {
        days: walletData.ageDays,
        points: bracketScore(walletData.ageDays, SCORING.AGE_BRACKETS),
      },
      txActivity: {
        count: walletData.txCount,
        points: bracketScore(walletData.txCount, SCORING.TX_BRACKETS),
      },
      usdtVolume: {
        amount: walletData.usdtVolume30d,
        points: bracketScore(walletData.usdtVolume30d, SCORING.VOLUME_BRACKETS),
      },
      portfolioDiversity: {
        tokenCount: tokenData.tokenCount,
        points: Math.min(tokenData.tokenCount * SCORING.DIVERSITY_PTS_PER_TOKEN, SCORING.DIVERSITY_MAX),
      },
      defiExperience: {
        positionCount: tokenData.defiPositions,
        points: Math.min(tokenData.defiPositions * SCORING.DEFI_PTS_PER_POSITION, SCORING.DEFI_MAX),
      },
      balanceHealth: {
        points: this.calcBalanceHealth(walletData.ethBalance, walletData.usdtBalance),
      },
      onChainHistory: {
        repayments: onChainRepayments,
        defaults: onChainDefaults,
        points: Math.min(
          Math.max(
            onChainRepayments * SCORING.REPAYMENT_PTS + onChainDefaults * SCORING.DEFAULT_PTS,
            -SCORING.HISTORY_MAX
          ),
          SCORING.HISTORY_MAX
        ),
      },
    };

    const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v.points, 0);
    const maxRaw = 150 + 150 + 150 + 100 + 100 + 100 + 100; // 850
    const normalizedScore = Math.max(
      SCORING.MIN_SCORE,
      Math.min(SCORING.MAX_SCORE, Math.round((rawScore / maxRaw) * (SCORING.MAX_SCORE - SCORING.MIN_SCORE) + SCORING.MIN_SCORE))
    );

    return {
      address,
      score: normalizedScore,
      breakdown,
      rawScore,
      normalizedScore,
    };
  }

  private calcBalanceHealth(ethBalance: number, usdtBalance: number): number {
    let pts = 0;
    if (ethBalance >= SCORING.BALANCE_ETH_THRESHOLD) pts += SCORING.BALANCE_ETH_PTS;
    if (usdtBalance > 0) pts += SCORING.BALANCE_USDT_PTS;
    pts += SCORING.BALANCE_NO_LIQUIDATION_PTS; // assume no liquidations on testnet
    return pts;
  }

  private async getWalletData(address: string) {
    try {
      const [txList, balance] = await Promise.all([
        this.etherscanFetch<EtherscanTxListResponse>('txlist', address),
        this.etherscanFetch<EtherscanBalanceResponse>('balance', address),
      ]);

      const txs = Array.isArray(txList.result) ? txList.result : [];
      const firstTx = txs.length > 0 ? parseInt(txs[0].timeStamp) : Date.now() / 1000;
      const ageDays = Math.floor((Date.now() / 1000 - firstTx) / 86400);

      // Estimate USDT volume from recent txs (simplified)
      const thirtyDaysAgo = Date.now() / 1000 - 30 * 86400;
      const recentTxs = txs.filter(tx => parseInt(tx.timeStamp) > thirtyDaysAgo);
      const usdtVolume30d = recentTxs.reduce((sum, tx) => sum + parseFloat(tx.value) / 1e18 * 2000, 0); // rough ETH→USD

      return {
        ageDays,
        txCount: txs.length,
        ethBalance: parseFloat(balance.result) / 1e18,
        usdtBalance: 0, // will be fetched separately if needed
        usdtVolume30d: Math.round(usdtVolume30d),
      };
    } catch {
      // Fallback for testnet where APIs might not work
      return { ageDays: 0, txCount: 0, ethBalance: 0, usdtBalance: 0, usdtVolume30d: 0 };
    }
  }

  private async getTokenData(address: string) {
    try {
      const res = await fetch(
        `https://api.covalenthq.com/v1/eth-sepolia/address/${address}/balances_v2/?key=${this.covalentKey}`
      );
      const data = await res.json() as { data?: { items?: Array<{ type: string }> } };
      const items = data?.data?.items || [];

      return {
        tokenCount: items.length,
        defiPositions: items.filter((t: { type: string }) => t.type === 'nft' || t.type === 'dust').length, // rough proxy
      };
    } catch {
      return { tokenCount: 0, defiPositions: 0 };
    }
  }

  private async etherscanFetch<T>(action: string, address: string): Promise<T> {
    const params = action === 'balance'
      ? `module=account&action=balance&address=${address}&tag=latest`
      : `module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc`;

    const res = await fetch(`${this.etherscanBase}?${params}&apikey=${this.etherscanKey}`);
    return res.json() as Promise<T>;
  }

  // Generate ASCII breakdown for Telegram display
  formatReport(report: CreditReport): string {
    const bar = (points: number, max: number) => {
      const filled = Math.round((points / max) * 5);
      return '#'.repeat(filled) + '-'.repeat(5 - filled);
    };

    const b = report.breakdown;
    return [
      `CREDIT REPORT — Score: ${report.normalizedScore}/850`,
      `| Wallet Age:     ${b.walletAge.days}d      [${bar(b.walletAge.points, 150)}]`,
      `| TX Activity:    ${b.txActivity.count} txns   [${bar(b.txActivity.points, 150)}]`,
      `| USDT Volume:    $${(b.usdtVolume.amount / 1000).toFixed(1)}K    [${bar(b.usdtVolume.points, 150)}]`,
      `| Portfolio:      ${b.portfolioDiversity.tokenCount} tokens  [${bar(b.portfolioDiversity.points, 100)}]`,
      `| DeFi:           ${b.defiExperience.positionCount} positions[${bar(b.defiExperience.points, 100)}]`,
      `| Balance:        health     [${bar(b.balanceHealth.points, 100)}]`,
      `| History:        ${b.onChainHistory.repayments}R/${b.onChainHistory.defaults}D   [${bar(Math.max(0, b.onChainHistory.points), 100)}]`,
    ].join('\n');
  }
}
