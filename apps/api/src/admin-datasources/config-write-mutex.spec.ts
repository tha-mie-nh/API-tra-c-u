import { ConfigWriteMutex } from './config-write-mutex';

describe('ConfigWriteMutex', () => {
  it('serializes concurrent run() calls so no two bodies overlap', async () => {
    const mutex = new ConfigWriteMutex();
    const order: string[] = [];
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const task = (label: string, delayMs: number) =>
      mutex.run(async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        order.push(`start:${label}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push(`end:${label}`);
        concurrentCount--;
      });

    await Promise.all([task('a', 20), task('b', 5), task('c', 5)]);

    expect(maxConcurrent).toBe(1);
    // Queued in call order, regardless of each task's own delay.
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('runs the next queued call even after an earlier call rejects', async () => {
    const mutex = new ConfigWriteMutex();

    const failing = mutex.run(async () => {
      throw new Error('boom');
    });
    const succeeding = mutex.run(async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(succeeding).resolves.toBe('ok');
  });

  it('returns each call its own resolved value independently', async () => {
    const mutex = new ConfigWriteMutex();
    const [a, b] = await Promise.all([mutex.run(async () => 1), mutex.run(async () => 2)]);
    expect([a, b]).toEqual([1, 2]);
  });
});
