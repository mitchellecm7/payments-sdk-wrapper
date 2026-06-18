// Integration test suite for payments-sdk-wrapper

import { Account, Keypair } from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../../src/client';
import { CoreEngine } from '../../src/core/engine';
import { ValidationError } from '../../src/errors';

const SENDER_KEYPAIR = Keypair.random();
const DESTINATION_KEYPAIR = Keypair.random();

describe('Core Flow', () => {
  it('should process transactions', async () => {
    const engine = new CoreEngine();
    const result = await engine.processTx('tx_001');
    expect(result).toBe(true);
  });

  it('should initialise OpenPaymentsClient and expose payments resource', () => {
    const client = new OpenPaymentsClient('test-api-key', 'https://horizon-testnet.stellar.org');
    expect(client.payments).toBeDefined();
  });

  it('should create a payment and return a response', async () => {
    const client = new OpenPaymentsClient(
      'test-api-key',
      'https://horizon-testnet.stellar.org',
      SENDER_KEYPAIR.secret(),
    );

    const mockHash = 'abc123def456';
    jest.spyOn(client.server, 'loadAccount').mockResolvedValue(
      new Account(SENDER_KEYPAIR.publicKey(), '1234') as any,
    );
    jest.spyOn(client.server, 'submitTransaction').mockResolvedValue({
      hash: mockHash,
      ledger: 1,
      successful: true,
      envelope_xdr: '',
      result_xdr: '',
      result_meta_xdr: '',
      paging_token: '',
    } as any);

    const response = await client.payments.create({
      amount: 10,
      currency: 'XLM',
      destination: DESTINATION_KEYPAIR.publicKey(),
    });

    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('status');
    expect(response.status).toBe('completed');
    expect(response.hash).toBe(mockHash);
  });

  it('should throw ValidationError for invalid destination', async () => {
    const client = new OpenPaymentsClient(
      'test-api-key',
      'https://horizon-testnet.stellar.org',
      SENDER_KEYPAIR.secret(),
    );

    await expect(
      client.payments.create({
        amount: 10,
        currency: 'XLM',
        destination: 'NOT_A_VALID_KEY',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError for non-positive amount', async () => {
    const client = new OpenPaymentsClient(
      'test-api-key',
      'https://horizon-testnet.stellar.org',
      SENDER_KEYPAIR.secret(),
    );

    await expect(
      client.payments.create({
        amount: -5,
        currency: 'XLM',
        destination: DESTINATION_KEYPAIR.publicKey(),
      }),
    ).rejects.toThrow(ValidationError);
  });
});
