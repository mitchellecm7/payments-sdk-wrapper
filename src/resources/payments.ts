import {
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../client';
import { ValidationError } from '../errors';
import { PaymentRequest, PaymentResponse } from '../types';
import { validatePaymentRequest } from '../validation';

const BASE_FEE = '100';
const TX_TIMEOUT_SECONDS = 30;

export class PaymentsResource {
  constructor(private client: OpenPaymentsClient) {}

  async create(payload: PaymentRequest): Promise<PaymentResponse> {
    validatePaymentRequest(payload);

    const secretKey = payload.senderSecretKey ?? this.client.senderSecretKey;
    if (!secretKey) {
      throw new ValidationError(
        'A sender secret key must be provided in the payload or on the client',
      );
    }

    const senderKeypair = Keypair.fromSecret(secretKey);
    const sourcePublicKey = senderKeypair.publicKey();

    const account = await this.client.server.loadAccount(sourcePublicKey);

    const asset =
      payload.currency === 'XLM'
        ? Asset.native()
        : new Asset(payload.currency, sourcePublicKey);

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: payload.destination,
          asset,
          amount: payload.amount.toString(),
        }),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();

    transaction.sign(senderKeypair);

    const result = await this.client.server.submitTransaction(transaction);

    return {
      id: result.hash,
      status: 'completed',
      hash: result.hash,
    };
  }
}
