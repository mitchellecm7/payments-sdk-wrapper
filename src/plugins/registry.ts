import { PaymentPlugin, PluginContext } from './types';

/**
 * PluginRegistry manages the ordered list of plugins and runs
 * their hooks at the appropriate points in the payment lifecycle.
 *
 * Hooks are executed in registration order. A failure in
 * `beforePayment` aborts the chain; failures in `onSuccess` /
 * `onError` are caught and logged so they never surface to the caller.
 */
export class PluginRegistry {
  private plugins: PaymentPlugin[] = [];

  /**
   * Register one or more plugins. Plugins are executed in the
   * order they are registered.
   */
  register(...plugins: PaymentPlugin[]): this {
    this.plugins.push(...plugins);
    return this;
  }

  /** Returns a shallow copy of the registered plugin list. */
  list(): ReadonlyArray<PaymentPlugin> {
    return [...this.plugins];
  }

  /**
   * Run every plugin's `beforePayment` hook in sequence.
   * Throws immediately if any plugin throws — aborting the payment.
   */
  async runBeforePayment(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.beforePayment) {
        await plugin.beforePayment(context);
      }
    }
  }

  /**
   * Run every plugin's `onSuccess` hook in sequence.
   * Errors are caught and logged so a misbehaving plugin cannot
   * prevent the caller from receiving the successful response.
   */
  async runOnSuccess(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onSuccess) {
        try {
          await plugin.onSuccess(context);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[PluginRegistry] Plugin "${plugin.name}" threw in onSuccess: ${msg}`);
        }
      }
    }
  }

  /**
   * Run every plugin's `onError` hook in sequence.
   * Errors are caught and logged so a misbehaving plugin cannot
   * swallow or transform the original error.
   */
  async runOnError(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onError) {
        try {
          await plugin.onError(context);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[PluginRegistry] Plugin "${plugin.name}" threw in onError: ${msg}`);
        }
      }
    }
  }
}
