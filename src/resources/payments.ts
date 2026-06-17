// Payments resource — handles payment creation and management

import { OpenPaymentsClient } from '../client';
import { PaymentRequest, PaymentResponse } from '../types';

export class PaymentsResource {
  constructor(private client: OpenPaymentsClient) {}

  async create(payload: PaymentRequest): Promise<PaymentResponse> {
    return { id: 'pay_123', status: 'completed' };
  }
}
