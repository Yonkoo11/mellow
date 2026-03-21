import './env.js';
import WDK from '@tetherto/wdk';
// @ts-ignore
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { EscrowService } from './escrow.js';
import { EscrowStatus } from './types.js';
import { evaluateTask, generateWork, evaluateSubmission } from './brain.js';
import { ethers } from 'ethers';
import { RPC_URL } from './constants.js';

const STATUS_LABELS: Record<number, string> = {
  0: 'OPEN', 1: 'ACCEPTED', 2: 'SUBMITTED',
  3: 'RELEASED', 4: 'DISPUTED', 5: 'REFUNDED',
};

function fmt(usdt: bigint): string { return `${Number(usdt) / 1e6} USDT`; }
function fmtEth(wei: bigint): string { return `${(Number(wei) / 1e18).toFixed(4)} ETH`; }
function short(addr: string): string { return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }
function txUrl(hash: string): string { return `https://sepolia.etherscan.io/tx/${hash}`; }
function log(icon: string, msg: string) { console.log(`${icon} ${msg}`); }
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const seedPhrase = process.env.WDK_SEED_PHRASE;
  const funderKey = process.env.PRIVATE_KEY;
  if (!seedPhrase || !funderKey) {
    console.error('Set WDK_SEED_PHRASE and PRIVATE_KEY in .env');
    process.exit(1);
  }

  // ═══════════════════════════════════════
  // Phase 1: WDK wallet derivation
  // ═══════════════════════════════════════

  log('🔧', 'Initializing Agent Escrow Protocol...\n');

  const wdk = new WDK(seedPhrase);
  wdk.registerWallet('ethereum', WalletManagerEvm, { provider: RPC_URL });

  const clientAccount = await wdk.getAccount('ethereum', 0);
  const workerAccount = await wdk.getAccount('ethereum', 1);

  const toHex = (buf: Uint8Array) => '0x' + Buffer.from(buf).toString('hex');
  const clientService = new EscrowService(toHex(clientAccount.keyPair.privateKey));
  const workerService = new EscrowService(toHex(workerAccount.keyPair.privateKey));
  const funderService = new EscrowService(funderKey);

  log('  ', `Client: ${clientAccount.address} (WDK #0)`);
  log('  ', `Worker: ${workerAccount.address} (WDK #1)`);
  log('  ', `Funder: ${funderService.address}`);
  console.log();

  // ═══════════════════════════════════════
  // Phase 2: Fund wallets
  // ═══════════════════════════════════════

  log('⛽', 'Funding agent wallets...');

  for (const [label, addr] of [['Client', clientAccount.address], ['Worker', workerAccount.address]]) {
    const eth = await funderService.getEthBalance(addr);
    if (eth < ethers.parseEther('0.005')) {
      const h = await funderService.sendEth(addr, ethers.parseEther('0.02'));
      log('  ', `0.02 ETH → ${label} | ${short(h)}`);
      await sleep(2000);
    }
  }

  const clientUsdt = await clientService.getUsdtBalance(clientAccount.address);
  if (clientUsdt < 500_000000n) {
    const h = await funderService.mintUsdt(clientAccount.address, 5000_000000n);
    log('  ', `5000 USDT → Client | ${short(h)}`);
    await sleep(2000);
  }

  const balances = {
    clientUsdt: await clientService.getUsdtBalance(clientAccount.address),
    clientEth: await clientService.getEthBalance(clientAccount.address),
    workerUsdt: await clientService.getUsdtBalance(workerAccount.address),
    workerEth: await clientService.getEthBalance(workerAccount.address),
  };

  console.log();
  log('💰', 'Balances:');
  log('  ', `Client: ${fmt(balances.clientUsdt)} | ${fmtEth(balances.clientEth)}`);
  log('  ', `Worker: ${fmt(balances.workerUsdt)} | ${fmtEth(balances.workerEth)}`);
  console.log();

  // ═══════════════════════════════════════
  // Phase 3: Client creates escrow
  // ═══════════════════════════════════════

  const task = 'Analyze the top 10 most active token contracts on Sepolia by transfer count over the past 7 days. Return contract addresses, token names, and transfer counts.';
  const amount = 100_000000n;
  const deadline = 3600;

  log('📋', 'CLIENT AGENT: Creating escrow...');
  log('  ', `Task: "${task.slice(0, 70)}..."`);
  log('  ', `Payment: ${fmt(amount)} + 1% fee | Deadline: ${deadline / 60}min`);

  const { id, txHash: createTx } = await clientService.createEscrow(
    workerAccount.address,
    clientAccount.address, // self-verify
    amount, deadline, task
  );

  log('  ', `→ Escrow #${id} created | ${txUrl(createTx)}`);
  console.log();
  await sleep(2000);

  // ═══════════════════════════════════════
  // Phase 4: Worker evaluates and accepts (LLM decision)
  // ═══════════════════════════════════════

  log('🔍', 'WORKER AGENT: Scanning for tasks...');

  const escrow = await workerService.getEscrow(id);
  log('  ', `Found: Escrow #${id} — ${fmt(escrow.amount)}`);

  log('🧠', 'WORKER AGENT: Evaluating task (LLM)...');
  const evaluation = await evaluateTask(
    Number(escrow.amount) / 1e6,
    escrow.deadline,
    task
  );
  log('  ', `Decision: ${evaluation.action.toUpperCase()}`);
  log('  ', `Reasoning: ${evaluation.reasoning}`);

  if (evaluation.action === 'skip') {
    log('❌', 'Worker skipped task. Demo ending.');
    return;
  }

  const acceptTx = await workerService.acceptEscrow(id);
  log('  ', `→ Accepted | ${txUrl(acceptTx)}`);
  console.log();
  await sleep(2000);

  // ═══════════════════════════════════════
  // Phase 5: Worker performs work (LLM generation)
  // ═══════════════════════════════════════

  log('⚡', 'WORKER AGENT: Performing task (LLM)...');

  const work = await generateWork(task);
  log('  ', `Generated ${work.result.length} chars of analysis`);

  const resultHash = ethers.keccak256(ethers.toUtf8Bytes(work.result));
  const submitTx = await workerService.submitWork(id, work.result);
  log('  ', `Result hash: ${resultHash.slice(0, 18)}...`);
  log('  ', `→ Submitted | ${txUrl(submitTx)}`);
  console.log();
  await sleep(2000);

  // ═══════════════════════════════════════
  // Phase 6: Client evaluates and releases (LLM decision)
  // ═══════════════════════════════════════

  log('✅', 'CLIENT AGENT: Reviewing submission (LLM)...');

  const submitted = await clientService.getEscrow(id);

  const releaseDecision = await evaluateSubmission(id, submitted.resultHash, submitted.status);
  log('  ', `Decision: ${releaseDecision.action.toUpperCase()}`);
  log('  ', `Reasoning: ${releaseDecision.reasoning}`);

  if (releaseDecision.action === 'dispute') {
    log('⚠️', 'Client disputed! Initiating dispute flow...');
    const disputeTx = await clientService.dispute(id, releaseDecision.reasoning);
    log('  ', `→ Disputed | ${txUrl(disputeTx)}`);
  } else if (releaseDecision.action === 'release') {
    const releaseTx = await clientService.verifyAndRelease(id);
    log('  ', `→ Released | ${txUrl(releaseTx)}`);
    log('  ', `→ ${fmt(amount)} → Worker | ${fmt(escrow.fee)} → Treasury`);
  } else {
    log('⏳', 'Client waiting. Demo ending.');
    return;
  }
  console.log();

  // ═══════════════════════════════════════
  // Phase 7: Summary
  // ═══════════════════════════════════════

  const final = await clientService.getEscrow(id);
  const finalClient = await clientService.getUsdtBalance(clientAccount.address);
  const finalWorker = await clientService.getUsdtBalance(workerAccount.address);

  log('📊', `Escrow #${id}: ${STATUS_LABELS[final.status]}`);
  log('  ', `Client: ${fmt(balances.clientUsdt)} → ${fmt(finalClient)}`);
  log('  ', `Worker: ${fmt(balances.workerUsdt)} → ${fmt(finalWorker)}`);
  console.log();
  // ═══════════════════════════════════════
  // Phase 8: Open bounty (worker = address(0))
  // ═══════════════════════════════════════

  log('🎯', 'CLIENT AGENT: Posting open bounty (any worker can claim)...');

  const bountyTask = 'Write a comparison of the top 5 Layer 2 scaling solutions for Ethereum. Compare them on TPS, finality time, security model, and TVL. Format as a structured report.';
  const bountyAmount = 50_000000n;

  const { id: bountyId, txHash: bountyTx } = await clientService.createEscrow(
    ethers.ZeroAddress,     // open bounty — anyone can accept
    clientAccount.address,  // self-verify
    bountyAmount, 3600, bountyTask
  );

  log('  ', `Task: "${bountyTask.slice(0, 60)}..."`);
  log('  ', `Payment: ${fmt(bountyAmount)} | Worker: OPEN`);
  log('  ', `→ Bounty #${bountyId} created | ${txUrl(bountyTx)}`);
  console.log();
  await sleep(2000);

  // Worker discovers and claims the open bounty
  log('🔍', 'WORKER AGENT: Found open bounty!');
  const bounty = await workerService.getEscrow(bountyId);
  log('  ', `Bounty #${bountyId} — ${fmt(bounty.amount)} — worker: ${bounty.worker === ethers.ZeroAddress ? 'OPEN' : short(bounty.worker)}`);

  log('🧠', 'WORKER AGENT: Evaluating bounty (LLM)...');
  const bountyEval = await evaluateTask(
    Number(bounty.amount) / 1e6,
    bounty.deadline,
    bountyTask
  );
  log('  ', `Decision: ${bountyEval.action.toUpperCase()}`);
  log('  ', `Reasoning: ${bountyEval.reasoning}`);

  if (bountyEval.action === 'skip') {
    log('❌', 'Worker skipped bounty.');
  } else {
    const claimTx = await workerService.acceptEscrow(bountyId);
    log('  ', `→ Claimed bounty | ${txUrl(claimTx)}`);
    console.log();
    await sleep(2000);

    log('⚡', 'WORKER AGENT: Working on bounty (LLM)...');
    const bountyWork = await generateWork(bountyTask);
    log('  ', `Generated ${bountyWork.result.length} chars`);

    const bountySubmitTx = await workerService.submitWork(bountyId, bountyWork.result);
    log('  ', `→ Submitted | ${txUrl(bountySubmitTx)}`);
    console.log();
    await sleep(2000);

    log('✅', 'CLIENT AGENT: Reviewing bounty submission (LLM)...');
    const bountySubmitted = await clientService.getEscrow(bountyId);
    const bountyDecision = await evaluateSubmission(bountyId, bountySubmitted.resultHash, bountySubmitted.status);
    log('  ', `Decision: ${bountyDecision.action.toUpperCase()}`);

    if (bountyDecision.action === 'release') {
      const releaseBountyTx = await clientService.verifyAndRelease(bountyId);
      log('  ', `→ Released | ${txUrl(releaseBountyTx)}`);
    }
  }
  console.log();

  // Final summary
  const endClient = await clientService.getUsdtBalance(clientAccount.address);
  const endWorker = await clientService.getUsdtBalance(workerAccount.address);

  log('📊', 'Final balances:');
  log('  ', `Client: ${fmt(balances.clientUsdt)} → ${fmt(endClient)}`);
  log('  ', `Worker: ${fmt(balances.workerUsdt)} → ${fmt(endWorker)}`);
  console.log();
  log('🏁', 'Demo complete. Dashboard: https://yonkoo11.github.io/mellow/');
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
