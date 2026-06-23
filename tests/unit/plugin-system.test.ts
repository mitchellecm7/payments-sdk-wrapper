import { Account, Keypair } from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../../src/client';
import { PaymentsResource } from '../../src/resources/payments';
import { PluginRegistry } from '../../src/plugins/registry';
import { PaymentPlugin, PluginContext } from '../../src/plugins/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const senderKeypair = Keypair.random();
const destinationKeypair = Keypair.random();

const VALID_PAYLOAD = {
  amount: 10,
  currency: 'XLM',
  destination: destinationKeypair.publicKey(),
  senderSecretKey: senderKeypair.secret(),
};

function createMockClient(
  overrides: Partial<Record<'loadAccount' | 'submitTransaction', jest.Mock>> = {},
) {
  const client = new OpenPaymentsClient('test-api-key', 'https://horizon-testnet.stellar.org');
  client.server = {
    loadAccount:
      overrides.loadAccount ??
      jest.fn(async () => new Account(senderKeypair.publicKey(), '1')),
    submitTransaction:
      overrides.submitTransaction ??
      jest.fn(async () => ({ hash: 'test-hash' })),
  } as any;
  return client;
}

function makePlugin(overrides: Partial<PaymentPlugin> = {}): PaymentPlugin & {
  beforePayment: jest.Mock;
  onSuccess: jest.Mock;
  onError: jest.Mock;
} {
  return {
    name: overrides.name ?? 'test-plugin',
    beforePayment: jest.fn(overrides.beforePayment ?? (() => Promise.resolve())),
    onSuccess: jest.fn(overrides.onSuccess ?? (() => Promise.resolve())),
    onError: jest.fn(overrides.onError ?? (() => Promise.resolve())),
  };
}

// ─── PluginRegistry ──────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  it('starts empty', () => {
    const registry = new PluginRegistry();
    expect(registry.list()).toHaveLength(0);
  });

  it('registers plugins and lists them', () => {
    const registry = new PluginRegistry();
    const a = makePlugin({ name: 'a' });
    const b = makePlugin({ name: 'b' });
    registry.register(a, b);
    expect(registry.list()).toEqual([a, b]);
  });

  it('register() returns this for chaining', () => {
    const registry = new PluginRegistry();
    const result = registry.register(makePlugin());
    expect(result).toBe(registry);
  });

  it('runBeforePayment calls each plugin in order', async () => {
    const order: string[] = [];
    const registry = new PluginRegistry();
    registry.register(
      { name: 'first', beforePayment: async () => { order.push('first'); } },
      { name: 'second', beforePayment: async () => { order.push('second'); } },
    );
    await registry.runBeforePayment({ request: { amount: 1, currency: 'XLM', destination: 'G' } });
    expect(order).toEqual(['first', 'second']);
  });

  it('runBeforePayment propagates errors (aborting the chain)', async () => {
    const second = jest.fn();
    const registry = new PluginRegistry();
    registry.register(
      { name: 'blocker', beforePayment: () => { throw new Error('abort'); } },
      { name: 'never', beforePayment: second },
    );
    await expect(
      registry.runBeforePayment({ request: { amount: 1, currency: 'XLM', destination: 'G' } }),
    ).rejects.toThrow('abort');
    expect(second).not.toHaveBeenCalled();
  });

  it('runOnSuccess swallows plugin errors and logs them', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const registry = new PluginRegistry();
    registry.register({ name: 'bad', onSuccess: () => { throw new Error('boom'); } });

    await expect(
      registry.runOnSuccess({ request: { amount: 1, currency: 'XLM', destination: 'G' } }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"bad"'),
    );
    consoleSpy.mockRestore();
  });

  it('runOnError swallows plugin errors and logs them', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const registry = new PluginRegistry();
    registry.register({ name: 'bad', onError: () => { throw new Error('double-fault'); } });

    await expect(
      registry.runOnError({ request: { amount: 1, currency: 'XLM', destination: 'G' } }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"bad"'),
    );
    consoleSpy.mockRestore();
  });

  it('skips hooks that are not implemented by the plugin', async () => {
    const registry = new PluginRegistry();
    // Only implements onSuccess — beforePayment and onError are undefined
    registry.register({ name: 'partial', onSuccess: jest.fn() });

    await expect(
      registry.runBeforePayment({ request: { amount: 1, currency: 'XLM', destination: 'G' } }),
    ).resolves.toBeUndefined();

    await expect(
      registry.runOnError({ request: { amount: 1, currency: 'XLM', destination: 'G' } }),
    ).resolves.toBeUndefined();
  });
});

// ─── OpenPaymentsClient plugin API ───────────────────────────────────────────

describe('OpenPaymentsClient plugin API', () => {
  it('exposes a pluginRegistry', () => {
    const client = new OpenPaymentsClient('key', 'https://horizon-testnet.stellar.org');
    expect(client.pluginRegistry).toBeInstanceOf(PluginRegistry);
  });

  it('registers plugins supplied to the constructor', () => {
    const plugin = makePlugin({ name: 'ctor-plugin' });
    const client = new OpenPaymentsClient(
      'key',
      'https://horizon-testnet.stellar.org',
      undefined,
      undefined,
      [plugin],
    );
    expect(client.pluginRegistry.list()).toContain(plugin);
  });

  it('client.use() registers a plugin and returns this', () => {
    const client = new OpenPaymentsClient('key', 'https://horizon-testnet.stellar.org');
    const plugin = makePlugin({ name: 'late-plugin' });
    const result = client.use(plugin);
    expect(result).toBe(client);
    expect(client.pluginRegistry.list()).toContain(plugin);
  });

  it('client.use() is chainable', () => {
    const client = new OpenPaymentsClient('key', 'https://horizon-testnet.stellar.org');
    const a = makePlugin({ name: 'a' });
    const b = makePlugin({ name: 'b' });
    client.use(a).use(b);
    expect(client.pluginRegistry.list()).toEqual([a, b]);
  });
});

// ─── PaymentsResource plugin lifecycle ───────────────────────────────────────

describe('PaymentsResource plugin lifecycle (create)', () => {
  it('calls beforePayment with the request context', async () => {
    const plugin = makePlugin();
    const client = createMockClient();
    client.use(plugin);

    await client.payments.create(VALID_PAYLOAD);

    expect(plugin.beforePayment).toHaveBeenCalledTimes(1);
    const ctx: PluginContext = plugin.beforePayment.mock.calls[0][0];
    expect(ctx.request.amount).toBe(VALID_PAYLOAD.amount);
    expect(ctx.request.currency).toBe(VALID_PAYLOAD.currency);
    expect(ctx.request.destination).toBe(VALID_PAYLOAD.destination);
  });

  it('calls onSuccess with request + response context', async () => {
    const plugin = makePlugin();
    const client = createMockClient();
    client.use(plugin);

    await client.payments.create(VALID_PAYLOAD);

    expect(plugin.onSuccess).toHaveBeenCalledTimes(1);
    const ctx: PluginContext = plugin.onSuccess.mock.calls[0][0];
    expect(ctx.response).toBeDefined();
    expect(ctx.response?.status).toBe('completed');
    expect(ctx.response?.hash).toBe('test-hash');
  });

  it('does not call onError on success', async () => {
    const plugin = makePlugin();
    const client = createMockClient();
    client.use(plugin);

    await client.payments.create(VALID_PAYLOAD);

    expect(plugin.onError).not.toHaveBeenCalled();
  });

  it('calls onError when submitTransaction throws, then re-throws', async () => {
    const networkError = new Error('network timeout');
    const submitTransaction = jest.fn().mockRejectedValue(networkError);
    const plugin = makePlugin();
    const client = createMockClient({ submitTransaction });
    client.use(plugin);

    await expect(client.payments.create(VALID_PAYLOAD)).rejects.toThrow('network timeout');

    expect(plugin.onError).toHaveBeenCalledTimes(1);
    const ctx: PluginContext = plugin.onError.mock.calls[0][0];
    expect(ctx.error).toBe(networkError);
  });

  it('does not call onSuccess on failure', async () => {
    const plugin = makePlugin();
    const client = createMockClient({
      submitTransaction: jest.fn().mockRejectedValue(new Error('fail')),
    });
    client.use(plugin);

    await expect(client.payments.create(VALID_PAYLOAD)).rejects.toThrow();
    expect(plugin.onSuccess).not.toHaveBeenCalled();
  });

  it('aborts the payment when beforePayment throws', async () => {
    const submitTransaction = jest.fn();
    const client = createMockClient({ submitTransaction });
    client.use({
      name: 'guard',
      beforePayment: () => { throw new Error('pre-flight check failed'); },
    });

    await expect(client.payments.create(VALID_PAYLOAD)).rejects.toThrow('pre-flight check failed');
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it('runs multiple plugins in registration order', async () => {
    const order: string[] = [];
    const client = createMockClient();
    client
      .use({ name: 'first', beforePayment: () => { order.push('first:before'); } })
      .use({ name: 'second', beforePayment: () => { order.push('second:before'); } });

    await client.payments.create(VALID_PAYLOAD);

    expect(order).toEqual(['first:before', 'second:before']);
  });
});
