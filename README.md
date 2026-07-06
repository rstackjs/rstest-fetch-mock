# rstest-fetch-mock

Fetch mock for [Rstest](https://rstest.rs). Ported from
[vitest-fetch-mock](https://github.com/IanVS/vitest-fetch-mock), which is itself
a fork of [jest-fetch-mock](https://github.com/jefflau/jest-fetch-mock).

It lets you mock the global `fetch` in your tests and assert on how it was
called, with a fluent, chainable API.

## Installation

```bash
npm install --save-dev rstest-fetch-mock
# or: pnpm add -D rstest-fetch-mock
```

Requires `@rstest/core` (declared as a peer dependency).

## Setup

Create a setup file that enables the mocks:

```ts
// rstest.setup.ts
import createFetchMock from 'rstest-fetch-mock';

const fetchMocker = createFetchMock();
fetchMocker.enableMocks();
```

Register it in your Rstest config:

```ts
// rstest.config.ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  setupFiles: ['./rstest.setup.ts'],
});
```

> Unlike `vitest-fetch-mock`, you do **not** need to pass the mocking API to
> `createFetchMock` — it defaults to Rstest's `rs`. If you prefer to be explicit,
> `createFetchMock(rs)` still works (import `rs` from `@rstest/core`).

After `enableMocks()`, `globalThis.fetch` is replaced by the mock and
`fetchMock` is available as a global for assertions.

## Usage

```ts
import { describe, it, expect, beforeEach } from '@rstest/core';

describe('api', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('mocks a response', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ secret: 'abcde' }));

    const res = await fetch('https://example.com').then((r) => r.json());

    expect(res).toEqual({ secret: 'abcde' });
    expect(fetchMock.mock.calls.length).toEqual(1);
    expect(fetchMock.mock.calls[0]![0]).toEqual('https://example.com');
  });
});
```

The full API — `mockResponse`, `mockResponseOnce` / `once`, `mockResponses`,
`mockResponseIf`, `mockReject` / `mockRejectOnce`, `mockAbort` / `mockAbortOnce`,
`doMock` / `dontMock` (and their `*If` / `*Once` variants), and `requests()` —
mirrors `vitest-fetch-mock`. See its
[documentation](https://github.com/IanVS/vitest-fetch-mock#api) for details; the
only change is that the setup takes no argument.

## License

MIT. This project retains the copyright notices of `vitest-fetch-mock` and
`jest-fetch-mock` — see [LICENSE](./LICENSE).
