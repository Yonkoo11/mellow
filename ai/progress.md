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

## Frontend
- [x] docs/index.html — single-file dashboard (~1560 lines, vanilla JS + ethers.js CDN)
- [x] Hero: logo, tagline, CTA, live stats ticker ($5K total, 0 loans, 0% util)
- [x] Dashboard tab: pool overview card, SVG donut chart, loans table, credit score lookup with SVG arc gauge
- [x] How It Works tab: 5-step node flow, 7 scoring components grid, decision tiers
- [x] Architecture tab: layered system diagram, tech badges, contract links to Etherscan with copy-to-clipboard
- [x] Dark theme (design token system, Inter + JetBrains Mono fonts), glassmorphism cards, mobile responsive
- [x] Live data from Sepolia via ethers.js (pool stats, loans, credit profiles)
- [x] Tab navigation (incl. keyboard arrow keys), monospace numbers, truncated addresses
- [x] Demo mode toggle: 5 sample loans, activity feed, multi-segment donut (solves empty-product problem for judges)
- [x] Polish: skeleton loading, animated counters, scroll-reveal (Intersection Observer), page transitions
- [x] Accessibility: skip link, aria labels, focus-visible, reduced-motion, keyboard support
- [x] Auto-refresh every 30s with "Updated" timestamp, retry on error
- [x] OG meta tags, favicon, theme-color
- [x] Living background: animated gradient mesh (3 blobs), SVG noise grain, 12 floating particles
- [x] Ambient color shift per tab (teal/blue/purple), breathing glow on stats bar
- [x] Hero gradient animation on "Autonomous", donut idle rotation (60s)
- [x] Flow line pulse animation, architecture connector pulse
- [x] Card hover glow, scoring row hover lift, table row striping
- [x] Pool health badge (dynamic: Healthy/Moderate/High Util)
- [x] Footer with brand, contract links, Telegram link
- [x] Noscript fallback, Twitter card meta tags
- [x] All animations respect prefers-reduced-motion
- [x] Verified: desktop 1280px + mobile 390px, all tabs, demo mode, live Sepolia data, all animations

## Bug Fixes
- [x] Fixed getPoolStats destructuring order (was showing idle/loaned swapped)
- [x] Fixed getLoan tuple: ethers Result uses numeric indices, not named props
- [x] Fixed Etherscan V2 API migration (V1 deprecated, V2 with chainid param)
- [x] Added demo scoring fallback for Sepolia (deterministic from address seed)

## /apply Flow Test Results
- [x] Pool summary: works ($5000 total, $4800 idle, $200 active, 1 loan)
- [x] Credit scoring: works (demo fallback produces realistic scores 326-750+)
- [x] Loan decision: works (template fallback, LLM needs valid Anthropic key)
- [x] On-chain loan creation: works (TX confirmed on Sepolia, loan #0 created)
- [x] Dashboard shows live loan data (table, donut, metrics all correct)
- [ ] Anthropic API key invalid (template fallback works fine for demo)
- [ ] Etherscan API key not enabled for Sepolia V2 (demo fallback works)

## Remaining
- [ ] Record demo video (5 min, script in plan)
- [ ] Submit on DoraHacks
- [x] Create GitHub repo and push code — https://github.com/Yonkoo11/mellow
- [x] GitHub Pages enabled — https://yonkoo11.github.io/mellow/
- [x] Test full /apply flow (credit score + decision + on-chain disburse) — DONE via CLI
