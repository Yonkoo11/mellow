import { ethers } from 'ethers';
import { ESCROW_ABI, ERC20_ABI, ADDRESSES, RPC_URL } from './constants.js';
import { EscrowData, EscrowStatus } from './types.js';

export class EscrowService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private contract: ethers.Contract;
  private usdt: ethers.Contract;

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true, batchMaxCount: 1 });
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(ADDRESSES.escrow, ESCROW_ABI, this.signer);
    this.usdt = new ethers.Contract(ADDRESSES.usdt, ERC20_ABI, this.signer);
  }

  get address(): string {
    return this.signer.address;
  }

  // --- Write ---

  async approveUsdt(amount: bigint): Promise<string> {
    const allowance = await this.usdt.allowance(this.address, ADDRESSES.escrow);
    if (allowance >= amount) return 'already-approved';
    const tx = await this.usdt.approve(ADDRESSES.escrow, ethers.MaxUint256);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async createEscrow(
    worker: string,
    verifier: string,
    amount: bigint,
    deadlineSeconds: number,
    taskDescription: string
  ): Promise<{ id: number; txHash: string }> {
    const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
    const taskHash = ethers.keccak256(ethers.toUtf8Bytes(taskDescription));

    // Approve first
    const feeBps = await this.contract.feeBps();
    const fee = (amount * feeBps) / 10000n;
    await this.approveUsdt(amount + fee);

    const tx = await this.contract.createEscrow(
      worker,
      verifier,
      ADDRESSES.usdt,
      amount,
      deadline,
      taskHash
    );
    const receipt = await tx.wait();

    // Parse escrow ID from event
    const event = receipt.logs.find((log: any) => {
      try {
        return this.contract.interface.parseLog(log)?.name === 'Created';
      } catch { return false; }
    });
    const parsed = this.contract.interface.parseLog(event);
    const id = Number(parsed!.args[0]);

    return { id, txHash: receipt.hash };
  }

  async acceptEscrow(id: number): Promise<string> {
    const tx = await this.contract.acceptEscrow(id);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async submitWork(id: number, resultData: string): Promise<string> {
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes(resultData));
    const tx = await this.contract.submitWork(id, resultHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async verifyAndRelease(id: number): Promise<string> {
    const tx = await this.contract.verifyAndRelease(id);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async dispute(id: number, reason: string): Promise<string> {
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const tx = await this.contract.dispute(id, reasonHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async refund(id: number): Promise<string> {
    const tx = await this.contract.refund(id);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  // --- Read ---

  async getEscrow(id: number): Promise<EscrowData> {
    const e = await this.contract.getEscrow(id);
    return {
      id,
      client: e.client,
      worker: e.worker,
      verifier: e.verifier,
      token: e.token,
      amount: e.amount,
      fee: e.fee,
      deadline: Number(e.deadline),
      taskHash: e.taskHash,
      resultHash: e.resultHash,
      status: Number(e.status) as EscrowStatus,
    };
  }

  async getNextId(): Promise<number> {
    return Number(await this.contract.nextId());
  }

  async getUsdtBalance(address: string): Promise<bigint> {
    return this.usdt.balanceOf(address);
  }

  async getEthBalance(address: string): Promise<bigint> {
    return this.provider.getBalance(address);
  }

  async mintUsdt(to: string, amount: bigint): Promise<string> {
    const tx = await this.usdt.mint(to, amount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async sendEth(to: string, amount: bigint): Promise<string> {
    const tx = await this.signer.sendTransaction({ to, value: amount });
    const receipt = await tx.wait();
    return receipt!.hash;
  }
}
