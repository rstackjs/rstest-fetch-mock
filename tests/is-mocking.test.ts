import { describe, expect, it, rs } from '@rstest/core';
import createFetchMock from '../src/index.js';

// Regression guard: `fetchMock.isMocking` is a public member of the type (and
// of vitest-fetch-mock's API), so it must be callable at *runtime*, not just
// present in the type. `copyMethods` only copies prototype methods, so the
// factory exposes the injected `isMocking` field explicitly. The parity suite
// only exercises `isMocking` indirectly (via do*/dont* toggles) and the only
// direct reference lives in the type-only `types/test.ts`, so this gap was
// otherwise uncovered at runtime.
describe('fetchMock.isMocking (public predicate)', () => {
  it('is callable at runtime and reflects do/dontMock state', () => {
    const fetch = createFetchMock(rs);

    expect(typeof fetch.isMocking).toBe('function');
    expect(fetch.isMocking('http://example.com')).toBe(true);

    fetch.dontMock();
    expect(fetch.isMocking('http://example.com')).toBe(false);

    fetch.doMock();
    expect(fetch.isMocking('http://example.com')).toBe(true);
  });

  // Regression: the shared `isMocking` is stateful, so `resetMocks()` must
  // reset it too. Otherwise a `dontMock()` / unconsumed `dontMockOnce()` from
  // one test bleeds through the restored default and sends the next test's
  // request to the real fetch instead of the default empty mocked response.
  it('is reset to the default by resetMocks (no state bleed across tests)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = rs.fn(async () => new Response('REAL_NETWORK'));
    const fetch = createFetchMock(rs);
    fetch.enableMocks();

    fetch.dontMock();
    fetch.resetMocks();
    expect(await globalThis.fetch('http://example.com').then((r) => r.text())).toBe('');

    fetch.dontMockOnce();
    fetch.resetMocks();
    expect(await globalThis.fetch('http://example.com').then((r) => r.text())).toBe('');

    fetch.disableMocks();
    globalThis.fetch = original;
  });
});
