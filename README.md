# Mellow - Autonomous AI Lending Agent

An AI agent that autonomously manages a USDT lending pool. It scores borrowers from on-chain data, makes loan decisions using LLM reasoning, disburses funds, tracks repayments, and earns yield on idle capital via Aave V3.

## How It Works

1. **Lenders** deposit USDT into the pool and earn pro-rata returns from interest
2. **Borrowers** apply for loans via Telegram commands
3. **The AI agent** analyzes on-chain credit data (wallet age, tx history, token diversity, DeFi experience), generates a credit score (300-850), and uses Claude to make approve/negotiate/deny decisions
4. Approved loans are disbursed automatically on-chain with reasoning stored permanently
5. Idle capital is deployed to Aave V3 for additional yield
6. Repayments improve credit scores; defaults are tracked and penalized

## Architecture

```
User (Telegram) <-> OpenClaw (Claude LLM)
                         |
                   Agent Backend (TypeScript)
                    /         |          \
             Credit Scorer  Pool Service  LLM Reasoner
             (Etherscan +   (ethers.js    (Claude Haiku,
              Covalent)      contracts)    loan decisions)
                    \         |          /
                     Sepolia Blockchain
                    /         |          \
             LoanPool.sol  CreditRegistry.sol  Aave V3
```

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `LoanPool.sol` | Core pool: deposit, withdraw, create loans, repay, mark defaults, Aave yield |
| `CreditRegistry.sol` | On-chain credit scores (300-850), repayment/default tracking |
| `MockUSDT.sol` | Testnet ERC20 with public mint for demo |

## Credit Scoring

| Component | Max Points | Data Source |
|-----------|-----------|-------------|
| Wallet Age | 150 | Etherscan |
| TX Activity | 150 | Etherscan |
| USDT Volume (30d) | 150 | Etherscan |
| Portfolio Diversity | 100 | Covalent |
| DeFi Experience | 100 | Covalent |
| Balance Health | 100 | Etherscan |
| On-chain History | 100 | CreditRegistry |

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/apply <amount> <days>` | Apply for a USDT loan |
| `/confirm` | Accept approved loan terms |
| `/repay <loanId>` | Repay a loan |
| `/score <address>` | View credit score breakdown |
| `/pool` | View pool statistics |
| `/deposit <amount>` | Deposit USDT to pool |
| `/withdraw <shares>` | Withdraw from pool |

## Setup

```bash
# Contracts
cd contracts
forge build
forge test

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast

# Agent
cd agent
npm install
cp .env.example .env  # Fill in contract addresses + API keys
npm start
```

## Tech Stack

- **Contracts:** Solidity 0.8.24, Foundry, OpenZeppelin v5
- **Agent:** TypeScript, ethers.js v6, Claude Haiku (Anthropic SDK)
- **Frontend:** Telegram via OpenClaw
- **Chain:** Ethereum Sepolia testnet
- **Yield:** Aave V3

## Prior Work Disclosure

This project reuses patterns from the [Faktory](https://github.com/example/faktory) project:
- `ReputationStaking.sol` -> scoring pattern for CreditRegistry
- `AgentRouter.sol` -> confidence-gated execution pattern
- `LendleYieldSource.sol` -> Aave interface pattern
- `agent/src/llm.ts` -> Claude integration with timeout + fallback
- `agent/src/agent.ts` -> Main loop with circuit breaker

## Team

Built for the Tether Hackathon Galactica: WDK Edition 1
