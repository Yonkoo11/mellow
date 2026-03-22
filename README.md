# Agent Escrow Protocol

Trustless escrow for agent-to-agent commerce. Two AI agents negotiate, execute work, and settle payment on-chain -- no human in the loop.

**Built for:** Tether Hackathon Galactica: WDK Edition 1 (Agent Wallets track)

**Live demo:** [Dashboard](https://yonkoo11.github.io/mellow/) | [Contract on Sepolia](https://sepolia.etherscan.io/address/0x68126baf9f282f91b9080c71aDa7e469d2e5E4D6) | [Demo Video](https://youtu.be/Nmnsz8uX3X0)

## What It Does

A client agent posts a task with USDT locked in escrow. A worker agent evaluates the task, accepts it, performs the work, and submits proof on-chain. The client reviews and releases payment. Every decision is made by an LLM. Every transaction is on Sepolia.

```
Client Agent (WDK #0)              Worker Agent (WDK #1)
    |                                    |
    |-- createEscrow(100 USDT, task) --> |
    |                                    |-- [LLM] evaluateTask()
    |                                    |-- acceptEscrow()
    |                                    |-- [LLM] generateWork()
    |                                    |-- submitWork(resultHash)
    |                                    |
    |-- [LLM] evaluateSubmission() ----> |
    |-- verifyAndRelease() ------------> |
    |                                    |
    Client: -101 USDT                   Worker: +100 USDT
    Treasury: +1 USDT (1% fee)
```

## How WDK Is Used

Both agents derive wallets from a single seed phrase using Tether's Wallet Development Kit:

```typescript
const wdk = new WDK(seedPhrase);
wdk.registerWallet('ethereum', WalletManagerEvm, { provider: RPC_URL });

const client = await wdk.getAccount('ethereum', 0); // BIP-44 index 0
const worker = await wdk.getAccount('ethereum', 1); // BIP-44 index 1
```

One seed, two wallets, two autonomous agents. Each holds its own USDT and ETH. No shared keys, no custodian.

## Demo Output (Real Sepolia Run)

```
Client: 0x23395c586869Db244Fb84244657d666Ad09A867d (WDK #0)
Worker: 0x480f3bc5656e4FF1D0CB5284bAA3B094db3B8125 (WDK #1)

CLIENT AGENT: Creating escrow...
  Task: "Analyze the top 10 most active token contracts on Sepolia..."
  Payment: 100 USDT + 1% fee | Deadline: 60min
  -> Escrow #4 created

WORKER AGENT: Evaluating task (LLM)...
  Decision: ACCEPT
  Reasoning: payment of 100 USDT exceeds minimum 10 USDT threshold,
  59 minutes remaining exceeds required 30-minute buffer, and token
  metrics analysis is within my core capabilities.

WORKER AGENT: Performing task (LLM)...
  Generated 2611 chars of analysis
  -> Submitted

CLIENT AGENT: Reviewing submission (LLM)...
  Decision: RELEASE
  Reasoning: Status is SUBMITTED indicating work completion, a valid
  non-zero result hash is provided. Payment should be released.
  -> Released

Escrow #4: RELEASED
  Client: 4596 -> 4495 USDT
  Worker: 100 -> 200 USDT
```

Transactions: [create](https://sepolia.etherscan.io/tx/0x7d49d7a3fa1ab67fcd2728b5e7544476035012c62ff9e554ca20e2ec79ecb097) | [accept](https://sepolia.etherscan.io/tx/0xca80e68ac24b655cb85e571fdc564be0459459cefd82114466b10cc22a4b0495) | [submit](https://sepolia.etherscan.io/tx/0xb15a34bff97db77329dca2c641fa7db358535dfe2e6cc1aa211305175f169369) | [release](https://sepolia.etherscan.io/tx/0x298b94054effb44233571a830427036d82e4f2e2631fe66848930eb58eed154f)

## Smart Contract

`AgentEscrow.sol` -- 182 lines, 32 passing tests, deployed to Sepolia.

**State machine:**
```
Open -> Accepted -> Submitted -> Released
  |        |                       |
  |        +--- Refunded (timeout) |
  |                                |
  +--- Disputed -------------------+
```

**Key properties:**
- 1% protocol fee (configurable, locked at creation)
- Worker can't be rugged: refund blocked after work submitted
- Open bounty mode: `worker = address(0)`, anyone can accept
- Task hash stored on-chain, result hash submitted as proof
- ReentrancyGuard, SafeERC20, custom errors

## Project Structure

```
contracts/
  src/AgentEscrow.sol     # Core escrow contract
  src/MockUSDT.sol        # Testnet ERC20
  test/AgentEscrow.t.sol  # 32 tests
  script/DeployEscrow.s.sol

agent/
  src/demo.ts             # End-to-end demo runner
  src/escrow.ts           # Contract interaction layer
  src/brain.ts            # LLM decision engine (Claude Haiku)
  src/types.ts            # Shared types
  src/constants.ts        # ABIs and addresses

openclaw/
  client-SKILL.md         # Client agent personality
  worker-SKILL.md         # Worker agent personality

docs/
  index.html              # Live dashboard (GitHub Pages)
```

## Run It Yourself

```bash
# Prerequisites: Node 20+, Foundry

# Tests
cd contracts && forge test -vv

# Demo (needs .env with PRIVATE_KEY, WDK_SEED_PHRASE, ANTHROPIC_API_KEY)
cd agent && npm install && npm run demo
```

## Tech Stack

- **Contracts:** Solidity 0.8.24, Foundry, OpenZeppelin v5
- **Agent:** TypeScript, ethers.js v6, Anthropic SDK (Claude Haiku)
- **Wallets:** Tether WDK (BIP-44 multi-account derivation)
- **Chain:** Ethereum Sepolia
- **Dashboard:** Vanilla HTML/JS, ethers.js CDN, GitHub Pages

## Team

Solo build for the Tether Hackathon Galactica: WDK Edition 1
