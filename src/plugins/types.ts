/**
 * Context passed to every plugin hook during a payment lifecycle.
 * The `response` field is only populated in `onSuccess`.
 */
export interface PluginContext {
  /** The original payment request payload. */
  request: {
    amount: number;
    currency: string;
    destination: string;
    senderSecretKey?: string;
    issuer?: string;
    /** Any extra metadata passed by the caller. */
    [key: string]: unknown;
  };
  /** The successful payment response — only present in `onSuccess`. */
  response?: {
    id: string;
    status: string;
    hash?: string;
  };
  /** The error that occurred — only present in `onError`. */
  error?: Error;
}

/**
 * A plugin hooks into the payment lifecycle at three points:
 *
 * - `beforePayment`  — runs before the transaction is submitted.
 *                       Throw here to abort the payment.
 * - `onSuccess`      — runs after a successful submission.
 * - `onError`        — runs after a failed submission.
 *
 * Every hook is optional; implement only the ones you need.
 */
export interface PaymentPlugin {
  /** Human-readable name used in error messages and logs. */
  name: string;

  /**
   * Called before the payment is submitted to the network.
   * Throw any error to abort the payment — downstream plugins
   * and the submission itself will not run.
   */
  beforePayment?(context: PluginContext): Promise<void> | void;

  /**
   * Called after a payment is successfully submitted.
   * Errors thrown here are logged but do not affect the caller.
   */
  onSuccess?(context: PluginContext): Promise<void> | void;

  /**
   * Called when the payment submission fails.
   * Errors thrown here are logged but do not affect the caller.
   */
  onError?(context: PluginContext): Promise<void> | void;
}
