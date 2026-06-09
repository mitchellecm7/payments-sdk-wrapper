import { PaymentsResource } from './resources/payments';

export class OpenPaymentsClient {
  public payments: PaymentsResource;

  constructor(private apiKey: string, private baseUrl: string) {
    this.payments = new PaymentsResource(this);
  }
}
