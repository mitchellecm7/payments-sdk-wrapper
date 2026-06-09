export interface PaymentRequest {
  amount: number;
  currency: string;
  destination: string;
}

export interface PaymentResponse {
  id: string;
  status: string;
}
