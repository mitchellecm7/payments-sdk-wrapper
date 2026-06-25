import { CircuitBreaker, CircuitState } from '../src/circuit';

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const cb = new CircuitBreaker();
    expect(cb.currentState).toBe(CircuitState.CLOSED);
  });

  it('should execute successfully and stay CLOSED', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.currentState).toBe(CircuitState.CLOSED);
  });

  it('should open after 5 consecutive failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const err = new Error('fail');

    for (let i = 0; i < 5; i++) {
      try { await cb.execute(() => Promise.reject(err)); } catch {}
    }

    expect(cb.currentState).toBe(CircuitState.OPEN);
  });

  it('should reject requests when OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch {}

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit is OPEN');
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
    try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch {}
    expect(cb.currentState).toBe(CircuitState.OPEN);

    await new Promise((r) => setTimeout(r, 15));
    try { await cb.execute(() => Promise.resolve('ok')); } catch {}
    expect(cb.currentState).toBe(CircuitState.CLOSED);
  });

  it('should close after success in HALF_OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
    try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch {}
    await new Promise((r) => setTimeout(r, 15));

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.currentState).toBe(CircuitState.CLOSED);
  });
});
