#!/bin/bash
# Mellow Demo Script - Full E2E on local Anvil
set -e

echo "Starting Mellow Demo..."
echo ""

# Start anvil
echo "1. Starting local Ethereum node..."
anvil --port 8546 --chain-id 31337 > /dev/null 2>&1 &
ANVIL_PID=$!
sleep 2

# Deploy contracts
echo "2. Deploying smart contracts..."
cd "$(dirname "$0")/../contracts"
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
AGENT_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
forge script script/Deploy.s.sol --rpc-url http://localhost:8546 --broadcast 2>&1 | grep -E "(MockUSDT|CreditRegistry|LoanPool|SUCCESSFUL)"

echo ""
echo "3. Running contract tests..."
forge test --summary 2>&1 | tail -3

echo ""
echo "4. Running agent unit tests..."
cd ../agent
npx vitest run tests/e2e.test.ts 2>&1 | tail -5

echo ""
echo "Demo complete!"
echo "Kill anvil: kill $ANVIL_PID"
