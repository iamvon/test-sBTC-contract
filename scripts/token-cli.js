#!/usr/bin/env node

import networkPkg from '@stacks/network';
import transactionsPkg from '@stacks/transactions';
import walletPkg from '@stacks/wallet-sdk';

const { createNetwork } = networkPkg;
const {
  broadcastTransaction,
  Cl,
  cvToValue,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  validateStacksAddress,
} = transactionsPkg;
const { generateWallet } = walletPkg;
const TOKEN_DECIMALS = 8n;

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }

  return args;
}

function printUsage() {
  console.error(`Usage:
  npm run token-cli -- --action faucet --recipient ST... --amount 100000000 --contract-address ST... --contract-name test-sbtc-faucet --mnemonic "24 words"
  npm run token-cli -- --action faucet --recipient ST... --ui-amount 1.25 --contract-address ST... --contract-name test-sbtc-faucet --mnemonic "24 words"
  npm run token-cli -- --action owner-mint --recipient ST... --amount 100000000 --contract-address ST... --contract-name test-sbtc-faucet --private-key <hex>

Required:
  --action faucet | owner-mint
  --recipient <stacks-address>
  --contract-address <deployer-address>
  --contract-name <contract-name>

Auth:
  --mnemonic <24-word seed phrase>
  or
  --private-key <hex private key>

Optional:
  --amount <uint in token base units>
  --ui-amount <decimal token amount, 8 decimals max>
  --network testnet | mainnet   default: testnet
  --node-url <custom stacks node url>
  --fee <microstx>
  --nonce <account nonce>
`);
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

async function resolvePrivateKey(args) {
  if (args['private-key']) {
    return args['private-key'];
  }

  if (args.mnemonic) {
    const wallet = await generateWallet({
      secretKey: args.mnemonic,
      password: '',
    });
    return wallet.accounts[0].stxPrivateKey;
  }

  throw new Error('Provide either --mnemonic or --private-key');
}

function formatTokenAmount(rawAmount) {
  const whole = rawAmount / 10n ** TOKEN_DECIMALS;
  const fraction = (rawAmount % 10n ** TOKEN_DECIMALS).toString().padStart(Number(TOKEN_DECIMALS), '0');
  return `${whole}.${fraction}`;
}

function resolveNetwork(args) {
  const networkName = args.network || 'testnet';
  if (networkName !== 'testnet' && networkName !== 'mainnet') {
    throw new Error(`Unsupported network "${networkName}". Use testnet or mainnet.`);
  }

  if (args['node-url']) {
    return createNetwork({
      network: networkName,
      client: { baseUrl: args['node-url'] },
    });
  }

  return createNetwork(networkName);
}

function parseAmount(args) {
  const rawAmount = args.amount;
  const uiAmount = args['ui-amount'];

  if (rawAmount && uiAmount) {
    throw new Error('Provide only one of --amount or --ui-amount');
  }

  if (rawAmount) {
    if (!/^\d+$/.test(rawAmount)) {
      throw new Error('--amount must be an unsigned integer in base units');
    }
    return BigInt(rawAmount);
  }

  if (uiAmount) {
    if (!/^\d+(\.\d+)?$/.test(uiAmount)) {
      throw new Error('--ui-amount must be a positive decimal number');
    }

    const [wholePart, fractionalPart = ''] = uiAmount.split('.');
    if (fractionalPart.length > 8) {
      throw new Error('--ui-amount supports at most 8 decimal places');
    }

    const paddedFraction = fractionalPart.padEnd(8, '0');
    return BigInt(`${wholePart}${paddedFraction}`);
  }

  throw new Error('Missing amount: provide either --amount or --ui-amount');
}

function parseReadOnlyValue(cv) {
  const parsed = cvToValue(cv);
  if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) {
    throw new Error('Unexpected read-only response shape from contract');
  }
  return parsed.value;
}

function validateAddress(address, label) {
  if (!validateStacksAddress(address)) {
    throw new Error(`Invalid ${label} Stacks address: ${address}`);
  }
}

async function preflightFaucet(args, network, senderAddress, amount) {
  const contractAddress = requireArg(args, 'contract-address');
  const contractName = requireArg(args, 'contract-name');

  const [enabledCv, maxAmountCv] = await Promise.all([
    fetchCallReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: 'is-faucet-enabled',
      functionArgs: [],
      senderAddress,
      network,
    }),
    fetchCallReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: 'get-faucet-max-amount',
      functionArgs: [],
      senderAddress,
      network,
    }),
  ]);

  const faucetEnabled = parseReadOnlyValue(enabledCv);
  const faucetMaxAmount = BigInt(parseReadOnlyValue(maxAmountCv));

  if (!faucetEnabled) {
    throw new Error('Preflight failed: faucet is disabled on-chain');
  }

  if (amount > faucetMaxAmount) {
    throw new Error(
      `Preflight failed: requested ${formatTokenAmount(amount)} exceeds faucet max ${formatTokenAmount(faucetMaxAmount)}`
    );
  }
}

function buildOptions(args, senderKey, network) {
  const action = requireArg(args, 'action');
  const amount = parseAmount(args);
  const recipient = requireArg(args, 'recipient');

  const base = {
    contractAddress: requireArg(args, 'contract-address'),
    contractName: requireArg(args, 'contract-name'),
    senderKey,
    network,
    functionArgs: [Cl.uint(amount), Cl.principal(recipient)],
  };

  if (args.fee) {
    base.fee = BigInt(args.fee);
  }

  if (args.nonce) {
    base.nonce = BigInt(args.nonce);
  }

  if (action === 'faucet') {
    return { ...base, functionName: 'faucet-mint' };
  }

  if (action === 'owner-mint') {
    return { ...base, functionName: 'owner-mint' };
  }

  throw new Error(`Unsupported action "${action}". Use faucet or owner-mint.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === 'true') {
    printUsage();
    process.exit(0);
  }

  const senderKey = await resolvePrivateKey(args);
  const network = resolveNetwork(args);
  const senderAddress = getAddressFromPrivateKey(senderKey, network);
  const recipient = requireArg(args, 'recipient');
  const amount = parseAmount(args);
  const action = requireArg(args, 'action');

  validateAddress(recipient, 'recipient');
  validateAddress(requireArg(args, 'contract-address'), 'contract');

  if (action === 'faucet') {
    await preflightFaucet(args, network, senderAddress, amount);
  }

  const options = buildOptions(args, senderKey, network);
  const transaction = await makeContractCall(options);
  const result = await broadcastTransaction({ transaction, network });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error.message);
  printUsage();
  process.exit(1);
});
