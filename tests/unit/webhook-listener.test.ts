import axios from 'axios';
import { WebhookListener } from '../../src/webhooks/webhook-listener';

jest.mock('axios');

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const ACCOUNT_A = 'GAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAAAAAAA';
const ACCOUNT_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const WEBHOOK_A = 'https://example.com/webhook-a';
const WEBHOOK_B = 'https://example.com/webhook-b';

function makePaymentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '123456789',
    type: 'payment',
    from: 'GAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAAAAAAA',
    to: ACCOUNT_A,
    amount: '10.0000000',
    asset_type: 'native',
    asset_code: undefined,
    asset_issuer: undefined,
    transaction_hash: 'abcdef123456',
    created_at: '2024-01-01T00:00:00Z',
    transaction_successful: true,
    ...overrides,
  };
}

function makeCreateAccountRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '987654321',
    type: 'create_account',
    funder: 'GAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAAAAAAA',
    account: ACCOUNT_A,
    starting_balance: '1000.0000000',
    asset_type: 'native',
    transaction_hash: 'fedcba987654',
    created_at: '2024-01-01T00:01:00Z',
    transaction_successful: true,
    ...overrides,
  };
}

function makeNonPaymentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '555555555',
    type: 'manage_offer',
    transaction_hash: 'xyz789',
    created_at: '2024-01-01T00:02:00Z',
    ...overrides,
  };
}

type OnMessageCallback = (record: Record<string, unknown>) => void;

describe('WebhookListener', () => {
  let streamCallbacks: Map<string, OnMessageCallback>;
  let closeFns: Map<string, jest.Mock>;

  function createServerMock(config: Record<string, string>) {
    streamCallbacks = new Map();
    closeFns = new Map();

    const streamMock = jest.fn(function (
      this: unknown,
      opts: { onmessage: OnMessageCallback; onerror: (event: unknown) => void },
    ) {
      streamCallbacks.set((this as any)._accountId, opts.onmessage);
      const close = jest.fn();
      closeFns.set((this as any)._accountId, close);
      return close;
    });

    const forAccountMock = jest.fn((id: string) => {
      const builder = {
        _accountId: id,
        stream: streamMock,
      };
      return builder;
    });

    const paymentsMock = jest.fn(() => ({
      forAccount: forAccountMock,
    }));

    return { paymentsMock, forAccountMock, streamMock };
  }

  function createListener(config: Record<string, string>) {
    const { paymentsMock } = createServerMock(config);
    const listener = new WebhookListener(HORIZON_URL, config);
    (listener as any).server = { payments: paymentsMock };
    return listener;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should subscribe to streams for all configured accounts on start', () => {
    const listener = createListener({
      [ACCOUNT_A]: WEBHOOK_A,
      [ACCOUNT_B]: WEBHOOK_B,
    });

    listener.start();

    const server = (listener as any).server;
    expect(server.payments).toHaveBeenCalledTimes(2);
    const forAccount = server.payments().forAccount;
    expect(forAccount).toHaveBeenCalledWith(ACCOUNT_A);
    expect(forAccount).toHaveBeenCalledWith(ACCOUNT_B);
  });

  it('should deliver webhook on incoming payment', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    const record = makePaymentRecord();
    streamCallbacks.get(ACCOUNT_A)!(record);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      WEBHOOK_A,
      {
        event: 'payment.received',
        account: ACCOUNT_A,
        payment: {
          id: record.id,
          from: record.from,
          to: record.to,
          amount: record.amount,
          asset_type: record.asset_type,
          asset_code: record.asset_code,
          asset_issuer: record.asset_issuer,
          transaction_hash: record.transaction_hash,
          created_at: record.created_at,
        },
      },
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('should not deliver webhook when recipient does not match', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    streamCallbacks.get(ACCOUNT_A)!(makePaymentRecord({ to: 'GOTHER' }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('should not deliver webhook for non-payment record types', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    streamCallbacks.get(ACCOUNT_A)!(makeNonPaymentRecord());

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('should handle create_account as incoming payment', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    streamCallbacks.get(ACCOUNT_A)!(makeCreateAccountRecord());

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      WEBHOOK_A,
      {
        event: 'payment.received',
        account: ACCOUNT_A,
        payment: {
          id: '987654321',
          from: 'GAAAAHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAAAAAAA',
          to: ACCOUNT_A,
          amount: '1000.0000000',
          asset_type: 'native',
          asset_code: undefined,
          asset_issuer: undefined,
          transaction_hash: 'fedcba987654',
          created_at: '2024-01-01T00:01:00Z',
        },
      },
      expect.anything(),
    );
  });

  it('should deliver webhooks to the correct webhook URL per account', () => {
    const listener = createListener({
      [ACCOUNT_A]: WEBHOOK_A,
      [ACCOUNT_B]: WEBHOOK_B,
    });
    listener.start();

    streamCallbacks.get(ACCOUNT_A)!(makePaymentRecord());
    streamCallbacks.get(ACCOUNT_B)!(makePaymentRecord({ to: ACCOUNT_B }));

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenCalledWith(
      WEBHOOK_A,
      expect.objectContaining({ account: ACCOUNT_A }),
      expect.anything(),
    );
    expect(axios.post).toHaveBeenCalledWith(
      WEBHOOK_B,
      expect.objectContaining({ account: ACCOUNT_B }),
      expect.anything(),
    );
  });

  it('should stop listening and clean up stream subscriptions', () => {
    const listener = createListener({
      [ACCOUNT_A]: WEBHOOK_A,
      [ACCOUNT_B]: WEBHOOK_B,
    });
    listener.start();
    listener.stop();

    expect(closeFns.get(ACCOUNT_A)).toHaveBeenCalledTimes(1);
    expect(closeFns.get(ACCOUNT_B)).toHaveBeenCalledTimes(1);
  });

  it('should be idempotent when start is called twice', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();
    listener.start();

    const server = (listener as any).server;
    expect(server.payments).toHaveBeenCalledTimes(1);
  });

  it('should handle webhook delivery failure gracefully', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    let caught: Error | undefined;
    try {
      streamCallbacks.get(ACCOUNT_A)!(makePaymentRecord());
      await new Promise(process.nextTick);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeUndefined();
  });

  it('should not deliver webhook when create_account recipient is not the configured account', () => {
    const listener = createListener({ [ACCOUNT_A]: WEBHOOK_A });
    listener.start();

    streamCallbacks
      .get(ACCOUNT_A)!(makeCreateAccountRecord({ account: 'GOTHER' }));

    expect(axios.post).not.toHaveBeenCalled();
  });
});
