import { Horizon, Networks } from '@stellar/stellar-sdk';
import { PluginRegistry } from './plugins/registry';
import { PaymentPlugin } from './plugins/types';
import { PaymentsResource } from './resources/payments';

export interface OpenPaymentsClientOptions {
  /**
   * The Horizon server base URL.
   * e.g. 'https://horizon-testnet.stellar.org'
   */
  baseUrl: string;
  /** Optional: the sender's Stellar secret key (can also be passed per-request). */
  senderSecretKey?: string;
  /**
   * The Stellar network passphrase.
   * Defaults to `Networks.TESTNET`.
   */
  networkPassphrase?: string;
  /**
   * Plugins to register at startup.
   * They are executed in the order provided.
   */
  plugins?: PaymentPlugin[];
}

export class OpenPaymentsClient {
  public payments: PaymentsResource;
  public server: Horizon.Server;
  public readonly pluginRegistry: PluginRegistry;

  constructor(
    _apiKey: string,
    public baseUrl: string,
    public senderSecretKey?: string,
    public networkPassphrase: string = Networks.TESTNET,
    plugins: PaymentPlugin[] = [],
  ) {
    this.server = new Horizon.Server(baseUrl);
    this.pluginRegistry = new PluginRegistry();

    if (plugins.length > 0) {
      this.pluginRegistry.register(...plugins);
    }

    this.payments = new PaymentsResource(this, this.pluginRegistry);
  }

  /**
   * Register one or more plugins after the client has been constructed.
   * Returns `this` for a fluent interface.
   *
   * @example
   * client.use(myPlugin).use(anotherPlugin);
   */
  use(...plugins: PaymentPlugin[]): this {
    this.pluginRegistry.register(...plugins);
    return this;
  }
}
