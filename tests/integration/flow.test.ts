// Integration test suite for payments-sdk-wrapper

import { OpenPaymentsClient } from '../../src/client';
import { CoreEngine } from '../../src/core/engine';

describe('Core Flow', () => {
  it('should process transactions', async () => {
    const engine = new CoreEngine();
    const result = await engine.processTx('tx_001');
    expect(result).toBe(true);
  });

  it('should initialise OpenPaymentsClient and expose payments resource', () => {
    const client = new OpenPaymentsClient('test-api-key', 'https://api.example.com');
    expect(client.payments).toBeDefined();
  });

  it('should create a payment and return a response', async () => {
    const client = new OpenPaymentsClient('test-api-key', 'https://api.example.com');
    const response = await client.payments.create({
      amount: 100,
      currency: 'USD',
      destination: 'GDESTINATION',
    });

    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('status');
    expect(response.status).toBe('completed');
  });
});
