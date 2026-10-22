import '@testing-library/jest-dom/vitest';

// jsdom implements neither API. `LazyAuthorizedImage` (Phase 07 photo
// timeline) needs both: IntersectionObserver to trigger lazy-loading, and
// URL.createObjectURL/revokeObjectURL to turn a fetched Blob into an <img
// src>. The stub reports every observed target as immediately intersecting
// so lazy content resolves synchronously in tests (no real viewport).
class IntersectionObserverStub {
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock-object-url';
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}
