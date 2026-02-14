import { computeNextAttemptAt } from '../notify-config';

describe('computeNextAttemptAt', () => {
  it('returns a future date', () => {
    const before = Date.now();
    const result = computeNextAttemptAt(1);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('increases delay with more attempts (exponential backoff)', () => {
    const t1 = computeNextAttemptAt(1).getTime() - Date.now();
    const t3 = computeNextAttemptAt(3).getTime() - Date.now();
    expect(t3).toBeGreaterThan(t1);
  });

  it('caps delay at NOTIFY_RETRY_MAX_SECONDS', () => {
    const result = computeNextAttemptAt(20);
    const delayMs = result.getTime() - Date.now();
    // Default max is 3600s = 3,600,000ms + up to 15s jitter
    expect(delayMs).toBeLessThanOrEqual(3615 * 1000);
  });
});
