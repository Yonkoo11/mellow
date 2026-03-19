// @ts-nocheck - WDK types are incomplete
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';

export class WDKService {
  private wdk: any;
  private initialized = false;

  constructor(private seedPhrase?: string, private rpcUrl: string = 'https://rpc.sepolia.org') {
    const seed = seedPhrase || WDK.getRandomSeedPhrase();
    this.wdk = new WDK(seed);
  }

  async initialize(): Promise<string> {
    this.wdk.registerWallet('ethereum', WalletManagerEvm, {
      provider: this.rpcUrl,
    });
    this.initialized = true;

    const account = await this.wdk.getAccount('ethereum', 0);
    return account.address;
  }

  async getAccount(index = 0) {
    if (!this.initialized) await this.initialize();
    return this.wdk.getAccount('ethereum', index);
  }

  async getAddress(index = 0): Promise<string> {
    const account = await this.getAccount(index);
    return account.address;
  }

  async sendTransaction(to: string, value: string, index = 0) {
    const account = await this.getAccount(index);
    return account.sendTransaction({ to, value });
  }

  async transfer(to: string, tokenAddress: string, amount: string, index = 0) {
    const account = await this.getAccount(index);
    return account.transfer({ to, token: tokenAddress, amount });
  }

  async approve(spender: string, tokenAddress: string, amount: string, index = 0) {
    const account = await this.getAccount(index);
    return account.approve({ spender, token: tokenAddress, amount });
  }

  async sign(message: string, index = 0): Promise<string> {
    const account = await this.getAccount(index);
    return account.sign(message);
  }

  static generateSeedPhrase(): string {
    return WDK.getRandomSeedPhrase();
  }
}
