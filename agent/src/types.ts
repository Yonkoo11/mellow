export enum EscrowStatus {
  Open = 0,
  Accepted = 1,
  Submitted = 2,
  Released = 3,
  Disputed = 4,
  Refunded = 5,
}

export interface EscrowData {
  id: number;
  client: string;
  worker: string;
  verifier: string;
  token: string;
  amount: bigint;
  fee: bigint;
  deadline: number;
  taskHash: string;
  resultHash: string;
  status: EscrowStatus;
}

export interface AgentIdentity {
  address: string;
  index: number;
  role: 'client' | 'worker';
}
