/**
 * In-process promise-chain mutex (phase-02 Architecture): serializes every
 * admin write to `config.json` so two concurrent requests can never
 * interleave a read-modify-write cycle and corrupt the file. No dependency
 * — a chained promise is the whole implementation. Only guards THIS
 * process; multi-replica divergence is a documented known limitation
 * (plan.md "Known limitations").
 */
export class ConfigWriteMutex {
  private tail: Promise<unknown> = Promise.resolve();

  /** Queues `fn` behind every previously-queued call; runs it once the
   * queue reaches it, regardless of whether earlier calls resolved or
   * rejected (a failed write must never permanently jam the queue). */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    // Swallow the rejection on the tail itself (not on `result`, which the
    // caller still awaits and can catch) so one failed write doesn't turn
    // every subsequent `.then()` in the chain into a no-op rejection.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
