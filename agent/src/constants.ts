export const ADDRESSES = {
  escrow: '0x68126baf9f282f91b9080c71aDa7e469d2e5E4D6',
  usdt: '0xf9e5a9E147856D9B26aB04202D79C2c3dA4a326B',
};

export const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

export const ESCROW_ABI = [
  'function createEscrow(address worker, address verifier, address token, uint256 amount, uint64 deadline, bytes32 taskHash) returns (uint256)',
  'function acceptEscrow(uint256 id)',
  'function submitWork(uint256 id, bytes32 resultHash)',
  'function verifyAndRelease(uint256 id)',
  'function dispute(uint256 id, bytes32 reason)',
  'function resolveDispute(uint256 id, bool releaseToWorker)',
  'function refund(uint256 id)',
  'function getEscrow(uint256 id) view returns (tuple(address client, address worker, address verifier, address token, uint256 amount, uint256 fee, uint64 deadline, bytes32 taskHash, bytes32 resultHash, uint8 status))',
  'function nextId() view returns (uint256)',
  'function feeBps() view returns (uint256)',
  'function treasury() view returns (address)',
  'event Created(uint256 indexed id, address indexed client, address worker, uint256 amount, bytes32 taskHash)',
  'event Accepted(uint256 indexed id, address indexed worker)',
  'event WorkSubmitted(uint256 indexed id, bytes32 resultHash)',
  'event Released(uint256 indexed id, address indexed worker, uint256 amount)',
  'event Disputed(uint256 indexed id, address indexed by, bytes32 reason)',
  'event DisputeResolved(uint256 indexed id, bool releasedToWorker)',
  'event Refunded(uint256 indexed id, address indexed client, uint256 amount)',
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
];
