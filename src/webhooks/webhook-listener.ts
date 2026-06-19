import axios from 'axios';
import { Horizon } from '@stellar/stellar-sdk';

export interface WebhookListenerConfig {
  [accountId: string]: string;
}

export interface PaymentWebhookPayload {
  event: string;
  account: string;
  payment: {
    id: string;
    from: string;
    to: string;
    amount: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    transaction_hash: string;
    created_at: string;
  };
}

export class WebhookListener {
  private server: Horizon.Server;
  private config: WebhookListenerConfig;
  private cleanupFns: Array<() => void> = [];
  private running = false;

  constructor(horizonUrl: string, config: WebhookListenerConfig) {
    this.server = new Horizon.Server(horizonUrl);
    this.config = config;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    for (const [accountId, webhookUrl] of Object.entries(this.config)) {
      this.subscribeAccount(accountId, webhookUrl);
    }
  }

  private subscribeAccount(accountId: string, webhookUrl: string): void {
    const close = this.server
      .payments()
      .forAccount(accountId)
      .stream({
        onmessage: (record) => {
          this.handlePaymentRecord(webhookUrl, accountId, record);
        },
        onerror: (_event) => {
          console.error(
            `[WebhookListener] Stream error for account ${accountId}. The SDK will attempt to reconnect automatically.`,
          );
        },
      });
    this.cleanupFns.push(close);
  }

  private handlePaymentRecord(
    webhookUrl: string,
    accountId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    record: any,
  ): void {
    if (
      record.type !== 'payment' &&
      record.type !== 'create_account'
    ) {
      return;
    }

    const recipient =
      record.type === 'create_account'
        ? (record.account as string)
        : (record.to as string);
    if (recipient !== accountId) {
      return;
    }

    const payment = {
      id: record.id as string,
      from: record.type === 'create_account'
        ? (record.funder as string)
        : (record.from as string),
      to: recipient,
      amount: record.type === 'create_account'
        ? (record.starting_balance as string)
        : (record.amount as string),
      asset_type: record.type === 'create_account'
        ? 'native'
        : (record.asset_type as string),
      asset_code: record.type === 'create_account'
        ? undefined
        : (record.asset_code as string | undefined),
      asset_issuer: record.type === 'create_account'
        ? undefined
        : (record.asset_issuer as string | undefined),
      transaction_hash: record.transaction_hash as string,
      created_at: record.created_at as string,
    };

    const payload: PaymentWebhookPayload = {
      event: 'payment.received',
      account: accountId,
      payment,
    };

    this.deliverWebhook(webhookUrl, accountId, payload);
  }

  private async deliverWebhook(
    webhookUrl: string,
    accountId: string,
    payload: PaymentWebhookPayload,
  ): Promise<void> {
    try {
      await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[WebhookListener] Failed to deliver webhook for account ${accountId}: ${message}`,
      );
    }
  }

  stop(): void {
    this.running = false;
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
  }
}
