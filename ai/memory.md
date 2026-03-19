# Mellow - AI Memory

## Architecture Decisions
- Using ethers.js as primary chain interaction (not WDK directly) because WDK SDK types are incomplete and ethers.js is more battle-tested for contract interactions
- WDK integrated as optional wrapper for wallet generation and key management
- Template-based LLM fallback ensures the agent works even without Claude API key
- Credit scoring uses Etherscan + Covalent with graceful fallback to zeros when APIs unavailable

## Key Patterns
- Circuit breaker in agent.ts (3 consecutive failures = pause)
- Share-based accounting in LoanPool (like ERC4626)
- Simple interest calculation (principal * rate * time / 365d / 10000)
- On-chain reasoning storage for audit trail

## Tech Notes
- WDK.getRandomSeedPhrase() returns 12 words (not 24)
- WDK constructor takes no args for seed phrase length
- Anvil nonce management is flaky with ethers.js when forge deploy precedes JS tests
- MockUSDT uses 6 decimals to match real USDT

## Deployment
- Contracts compile with Solc 0.8.24
- 24 Foundry tests pass
- 7 agent unit tests pass
- Need Sepolia ETH for real deployment (faucet needed)
