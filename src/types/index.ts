export interface PaymentRequest {
  amount: number;
  currency: string;
  destination: string;
  senderSecretKey?: string;
}

export interface PaymentResponse {
  id: string;
  status: string;
  hash?: string;
}
