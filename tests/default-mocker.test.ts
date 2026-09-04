import { afterAll, beforeAll, describe, expect, it } from 'rstack/test';
import createFetchMock from '../src/index.js';

// Rstest-specific: createFetchMock defaults its argument to `rs`, so it can be
// called with no argument (unlike vitest-fetch-mock, which requires `vi`).
describe('createFetchMock() without an explicit mocker', () => {
  const fetch = createFetchMock();

  beforeAll(() => {
    fetch.enableMocks();
  });

  afterAll(() => {
    fetch.disableMocks();
  });

  it('mocks a response when called with no argument', async () => {
    fetch.mockResponseOnce(JSON.stringify({ ok: true }));

    const response = await globalThis
      .fetch('https://example.com')
      .then((r) => r.json());

    expect(response).toEqual({ ok: true });
    expect(fetch.mock.calls.length).toEqual(1);
  });
});
