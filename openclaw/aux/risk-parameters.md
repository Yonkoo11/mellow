# Risk Parameters

## Pool Limits
- Max single loan: 1,000 USDT
- Min credit score: 450
- Grace period before default: 7 days
- Max pool utilization target: 80%

## Aave Yield Strategy
- Deploy idle USDT when balance > 100 USDT
- Keep 20% buffer for loan demand
- Withdraw from Aave when utilization > 70%

## Circuit Breaker
- 3 consecutive failures = pause operations
- Auto-resume after 60 seconds
- All failures logged for review
