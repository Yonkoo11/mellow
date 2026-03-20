# Mellow Build Progress

## Done
- [x] Foundry project with OZ v5, Solc 0.8.24
- [x] MockUSDT.sol (6 decimals, public mint)
- [x] CreditRegistry.sol (300-850 scores, authorized updaters)
- [x] LoanPool.sol (deposit/withdraw/loan/repay/default/aave, share-based)
- [x] 24/24 contract tests passing
- [x] Deploy.s.sol script (verified on local anvil)
- [x] Agent: types, constants, pool, credit, llm, monitor, agent, index, wdk
- [x] 7/7 agent unit tests passing (credit scorer + LLM template decisions)
- [x] WDK SDK integrated (wallet generation, tx signing)
- [x] OpenClaw SKILL.md + aux files
- [x] README.md with architecture, setup, prior work disclosure
- [x] .gitignore, git init, initial commit
- [x] Calendar deadline set (Mar 22, 3-day reminder)
- [x] Contracts deployed to Sepolia (all 6 txs confirmed)
- [x] .env populated with keys + addresses
- [x] RPC updated to publicnode.com (rpc.sepolia.org was down)
- [x] Pool seeded: 10K USDT minted, 5K deposited to pool
- [x] Telegram bot starts and connects successfully
- [x] Contract queries work live on Sepolia (getPoolStats, balanceOf)

## Deployed Contracts (Sepolia)
- MockUSDT: 0xf9e5a9E147856D9B26aB04202D79C2c3dA4a326B
- CreditRegistry: 0xb8F4546e24e437779bC09c3b70ce70Ff9542bdD4
- LoanPool: 0x9A6d36A0487EA52df43E7704a97F47844C4Eac4E
- Agent: 0xf9946775891a24462cD4ec885d0D4E2675C84355

## Pool State
- 5,000 USDT in pool (idle)
- 5,000 USDT in agent wallet
- 0 active loans

## Note
- Deploy script msg.sender (0x1804...) != EOA signer (0xf994...). Minted separately via agent.
- RPC: https://ethereum-sepolia-rpc.publicnode.com

## Remaining
- [ ] Test full /apply flow through Telegram (credit score + LLM + disburse)
- [ ] Record demo video (5 min, script in plan)
- [ ] Submit on DoraHacks
- [ ] Create GitHub repo and push code
