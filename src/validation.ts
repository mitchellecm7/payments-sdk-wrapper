import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import { ValidationError } from './errors';

const ASSET_CODE_REGEX = /^[A-Za-z0-9]{1,12}$/;

const PaymentRequestSchema = z.object({
  amount: z
    .number()
    .positive({ message: 'amount must be greater than zero' }),
  currency: z
    .string()
    .refine(
      (val) => val === 'XLM' || ASSET_CODE_REGEX.test(val),
      { message: 'currency must be "XLM" or a valid alphanumeric asset code (1–12 characters)' },
    ),
  destination: z
    .string()
    .refine(
      (val) => StrKey.isValidEd25519PublicKey(val),
      { message: 'destination must be a valid Stellar Ed25519 public key' },
    ),
  senderSecretKey: z.string().optional(),
});

export function validatePaymentRequest(payload: unknown): void {
  const result = PaymentRequestSchema.safeParse(payload);
  if (!result.success) {
    const messages = result.error.issues.map((e) => e.message).join('; ');
    throw new ValidationError(messages);
  }
}
