import { UpstreamTimeoutError } from './adapter-errors';

/**
 * Races `promise` against a timer; rejects with UpstreamTimeoutError if the
 * timer wins. Shared by every adapter kind so "per-datasource timeout"
 * (phase-04 Non-functional requirement) is implemented once, not per adapter.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, datasourceCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new UpstreamTimeoutError(`${datasourceCode}: timed out after ${timeoutMs}ms`, datasourceCode));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
