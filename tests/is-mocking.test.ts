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
});
