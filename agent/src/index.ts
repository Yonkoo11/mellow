import TelegramBot from 'node-telegram-bot-api';
import { MellowAgent } from './agent.js';
import type { AgentConfig, LoanRequest } from './types.js';

// Pending applications (borrower address -> loan request + decision)
const pendingApplications = new Map<number, { request: LoanRequest; chatId: number }>();

function loadConfig(): AgentConfig {
  return {
    rpcUrl: process.env.RPC_URL || 'https://rpc.sepolia.org',
    privateKey: process.env.PRIVATE_KEY || '',
    usdtAddress: process.env.USDT_ADDRESS || '',
    poolAddress: process.env.POOL_ADDRESS || '',
    registryAddress: process.env.REGISTRY_ADDRESS || '',
    aavePoolAddress: process.env.AAVE_POOL_ADDRESS || '',
    etherscanApiKey: process.env.ETHERSCAN_API_KEY || '',
    covalentApiKey: process.env.COVALENT_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  };
}

async function main() {
  const config = loadConfig();

  if (!config.privateKey || !config.poolAddress) {
    console.error('Missing required env vars. Set PRIVATE_KEY, USDT_ADDRESS, POOL_ADDRESS, REGISTRY_ADDRESS');
    process.exit(1);
  }

  const agent = new MellowAgent(config);
  console.log(`Mellow Agent started. Address: ${agent.agentAddress}`);

  if (!config.telegramBotToken) {
    console.log('No TELEGRAM_BOT_TOKEN set. Running in CLI mode.');
    console.log('Pool summary:');
    console.log(await agent.getPoolSummary());
    return;
  }

  // --- Telegram Bot ---
  const bot = new TelegramBot(config.telegramBotToken, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, [
      'Welcome to Mellow - Autonomous Lending Agent',
      '',
      'Commands:',
      '/apply <amount> <days> - Apply for a USDT loan',
      '/confirm - Accept approved loan terms',
      '/repay <loanId> - Repay a loan',
      '/score <address> - Check credit score',
      '/pool - View pool stats',
      '/balance <address> - Check position',
      '/help - Show this message',
    ].join('\n'));
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, [
      'Mellow Commands:',
      '/apply <amount> <days> - Apply for a USDT loan',
      '/confirm - Accept approved loan terms',
      '/repay <loanId> - Repay a loan',
      '/score <address> - Check credit score',
      '/pool - View pool stats',
      '/help - Show this message',
    ].join('\n'));
  });

  bot.onText(/\/apply (\d+\.?\d*) (\d+)/, async (msg, match) => {
    if (!match) return;
    const chatId = msg.chat.id;
    const amount = parseFloat(match[1]);
    const durationDays = parseInt(match[2]);

    // For demo, use a deterministic address from chat ID
    const borrowerAddress = `0x${chatId.toString(16).padStart(40, '0')}`;

    bot.sendMessage(chatId, 'Analyzing your credit profile...');

    try {
      const request: LoanRequest = { borrower: borrowerAddress, amount, durationDays };
      const { report, decision } = await agent.processLoanApplication(request);
      const formatted = agent.formatDecision(report, decision, request);

      if (decision.decision !== 'DENY') {
        pendingApplications.set(chatId, { request, chatId });
      }

      bot.sendMessage(chatId, formatted);
    } catch (err) {
      bot.sendMessage(chatId, `Error processing application: ${err}`);
    }
  });

  bot.onText(/\/confirm/, async (msg) => {
    const chatId = msg.chat.id;
    const pending = pendingApplications.get(chatId);

    if (!pending) {
      bot.sendMessage(chatId, 'No pending application. Use /apply first.');
      return;
    }

    try {
      const result = await agent.processLoanApplication(pending.request);
      if (result.txHash) {
        bot.sendMessage(chatId, `Loan disbursed! TX: ${result.txHash}\n\nFunds have been sent to your wallet.`);
      } else {
        bot.sendMessage(chatId, 'Loan was not approved on final review.');
      }
      pendingApplications.delete(chatId);
    } catch (err) {
      bot.sendMessage(chatId, `Error disbursing loan: ${err}`);
    }
  });

  bot.onText(/\/repay (\d+)/, async (msg, match) => {
    if (!match) return;
    const chatId = msg.chat.id;
    const loanId = parseInt(match[1]);
    const borrowerAddress = `0x${chatId.toString(16).padStart(40, '0')}`;

    try {
      const txHash = await agent.handleRepayment(borrowerAddress, loanId);
      bot.sendMessage(chatId, `Repayment successful! TX: ${txHash}\n\nYour credit score has been updated.`);
    } catch (err) {
      bot.sendMessage(chatId, `Error processing repayment: ${err}`);
    }
  });

  bot.onText(/\/score (.+)/, async (msg, match) => {
    if (!match) return;
    const chatId = msg.chat.id;
    const address = match[1].trim();

    try {
      const report = await agent.getCreditReport(address);
      bot.sendMessage(chatId, report);
    } catch (err) {
      bot.sendMessage(chatId, `Error fetching credit score: ${err}`);
    }
  });

  bot.onText(/\/pool/, async (msg) => {
    try {
      const summary = await agent.getPoolSummary();
      bot.sendMessage(msg.chat.id, summary);
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Error fetching pool stats: ${err}`);
    }
  });

  // --- Cron Jobs ---
  // Check overdue loans every 6 hours
  setInterval(async () => {
    try {
      const messages = await agent.checkAndProcessDefaults();
      for (const m of messages) {
        console.log('[MONITOR]', m);
      }
    } catch (err) {
      console.error('[MONITOR] Error:', err);
    }
  }, 6 * 60 * 60 * 1000);

  // Deploy idle funds to Aave every 12 hours
  setInterval(async () => {
    try {
      const result = await agent.deployIdleToAave();
      if (result) console.log('[AAVE]', result);
    } catch (err) {
      console.error('[AAVE] Error:', err);
    }
  }, 12 * 60 * 60 * 1000);

  console.log('Telegram bot running. Listening for commands...');
}

main().catch(console.error);
