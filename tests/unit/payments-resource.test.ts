import { Account, Keypair } from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../../src/client';
import { PaymentsResource } from '../../src/resources/payments';
import { ValidationError } from '../../src/errors';
import { validatePaymentRequest } from '../../src/validation';

describe('PaymentsResource', () => {
  const senderKeypair = Keypair.random();
  const destinationKeypair = Keypair.random();
  const VALID_PAYLOAD = {
    amount: 10,
    currency: 'XLM',
    destination: destinationKeypair.publicKey(),
    senderSecretKey: senderKeypair.secret(),
  };

  function createMockClient(overrides: Partial<Record<'loadAccount' | 'submitTransaction', jest.Mock>> = {}) {
    const client = new OpenPaymentsClient('test-api-key', 'https://horizon-testnet.stellar.org');
    client.server = {
      loadAccount: overrides.loadAccount ?? jest.fn(async () => new Account(senderKeypair.publicKey(), '1')),
      submitTransaction:
        overrides.submitTransaction ??
        jest.fn(async () => ({ hash: 'test-hash' })),
    } as any;
    return client;
  }

  it('validates a correct payment request without throwing', () => {
    expect(() => validatePaymentRequest(VALID_PAYLOAD)).not.toThrow();
  });

  it('throws ValidationError for an invalid payment request', () => {
    expect(() =>
      validatePaymentRequest({
        amount: -1,
        currency: 'XLM',
        destination: 'invalid-destination',
      }),
    ).toThrow(ValidationError);
  });

  it('creates an XLM payment and returns a completed response', async () => {
    const client = createMockClient();
    const payments = new PaymentsResource(client);

    const response = await payments.create(VALID_PAYLOAD);

    expect((client.server.loadAccount as jest.Mock)).toHaveBeenCalledWith(senderKeypair.publicKey());
    expect((client.server.submitTransaction as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ id: 'test-hash', status: 'completed', hash: 'test-hash' });
  });

  it('throws ValidationError when no sender secret key is provided', async () => {
    const client = createMockClient();
    const payments = new PaymentsResource(client);

    await expect(
      payments.create({
        amount: 5,
        currency: 'XLM',
        destination: destinationKeypair.publicKey(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('builds a payment transaction using a custom asset when currency is not XLM', async () => {
    const submitTransaction = jest.fn(async (transaction: any) => {
      expect(transaction.operations[0].asset.isNative()).toBe(false);
      expect(transaction.operations[0].asset.getCode()).toBe('USDC');
      expect(transaction.operations[0].amount).toBe('25');
      return { hash: 'custom-asset-hash' };
    });

    const client = createMockClient({ submitTransaction });
    const payments = new PaymentsResource(client);

    const response = await payments.create({
      amount: 25,
      currency: 'USDC',
      destination: destinationKeypair.publicKey(),
      senderSecretKey: senderKeypair.secret(),
    });

    expect(response).toEqual({ id: 'custom-asset-hash', status: 'completed', hash: 'custom-asset-hash' });
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });
});
