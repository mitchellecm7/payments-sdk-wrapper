import { Horizon } from '@stellar/stellar-sdk';
import { PluginRegistry } from './plugins/registry';
import { PaymentPlugin } from './plugins/types';
import { PaymentsResource } from './resources/payments';
import { config } from './config';
import { CircuitBreaker } from './circuit';

export interface OpenPaymentsClientOptions {
  baseUrl?: string;
  senderSecretKey?: string;
  networkPassphrase?: string;
  plugins?: PaymentPlugin[];
}

export class OpenPaymentsClient {
  public payments: PaymentsResource;
  public server: Horizon.Server;
  public readonly pluginRegistry: PluginRegistry;
  public readonly rpcBreaker: CircuitBreaker;
  public readonly horizonBreaker: CircuitBreaker;

  constructor(
    _apiKey?: string,
    public baseUrl: string = config.horizonUrl,
    public senderSecretKey: string | undefined = config.senderSecretKey,
    public networkPassphrase: string = config.networkPassphrase,
    plugins: PaymentPlugin[] = [],
  ) {
    this.server = new Horizon.Server(baseUrl);
    this.pluginRegistry = new PluginRegistry();

    this.rpcBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
    });

    this.horizonBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
    });

    if (plugins.length > 0) {
      this.pluginRegistry.register(...plugins);
    }

    this.payments = new PaymentsResource(this, this.pluginRegistry);
  }

  use(...plugins: PaymentPlugin[]): this {
    this.pluginRegistry.register(...plugins);
    return this;
  }
}
