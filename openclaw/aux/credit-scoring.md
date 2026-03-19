# Credit Scoring Reference

## Data Sources
1. **Etherscan API**: wallet age, tx count, ETH balance
2. **Covalent GoldRush**: token diversity, DeFi positions
3. **On-chain CreditRegistry**: repayment/default history

## Algorithm (300-850 FICO-like range)

| Component | Max Pts | Calculation |
|-----------|---------|-------------|
| Wallet Age | 150 | 0d=0, 30d=50, 90d=100, 365d+=150 |
| TX Activity | 150 | 0tx=0, 10tx=50, 50tx=100, 200tx+=150 |
| USDT Volume (30d) | 150 | $0=0, $1K=50, $10K=100, $50K+=150 |
| Portfolio Diversity | 100 | 10 pts per token (cap 100) |
| DeFi Experience | 100 | 20 pts per position (cap 100) |
| Balance Health | 100 | ETH>0.1=30, USDT>0=30, no liquidations=40 |
| On-chain History | 100 | +25 per repayment, -50 per default |

Raw score normalized to 300-850 range.
