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

Requirements:

- `@rstest/core` (declared as a peer dependency).
- A runtime with global `fetch`, `Request`, `Response`, and `Headers` — Node
  18+ (or a `jsdom` / `happy-dom` test environment, which provide them). The
  mock builds real `Response` objects, so these globals must exist.

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

### Typing the `fetchMock` global

`rstest-fetch-mock` declares `fetchMock` on the global scope, but TypeScript
only sees that declaration when the package's types are part of your program.
If test files use `fetchMock` without an import and TS reports it as undefined,
either make sure the setup file (which imports the package) is covered by your
`tsconfig.json` `include`, or add a triple-slash reference in a `.d.ts` that is
already included in your project:

```ts
/// <reference types="rstest-fetch-mock" />
```

Prefer the reference directive over `compilerOptions.types` — that field is an
allow-list that **replaces** TypeScript's default auto-inclusion of `@types/*`
(e.g. `@types/node`), so setting it just for this package would drop the rest.

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

## Resetting between tests

Reset the fetch mock with its own **`fetchMock.resetMocks()`** (typically in
`beforeEach`), as shown above. Be aware of how it interacts with Rstest's
global mock lifecycle — `fetchMock` is created with `rs.fn`, so Rstest's
project-wide reset/restore also touch it:

| Trigger                                            | Effect on the fetch mock                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `rs.clearAllMocks()` / config `clearMocks: true`   | Clears recorded calls only. Queued responses **survive**; `fetch` stays mocked.       |
| `rs.resetAllMocks()` / config `mockReset: true`    | **Wipes queued responses** and installed implementations; `fetch` stays mocked.       |
| `rs.restoreAllMocks()` / config `restoreMocks: true` | Wipes queued responses; `fetch` **stays mocked** (it is _not_ restored to native).  |

Two consequences worth remembering:

- If you enable `mockReset` / `restoreMocks` globally, per-test
  `mockResponse*` setups are cleared between tests — set them up inside each
  test (or in `beforeEach`), not once at the top.
- Neither `resetMocks()` nor `rs.restoreAllMocks()` restores the native
  `fetch`. Call **`fetchMock.disableMocks()`** when you actually need the real
  `fetch` back.

## API

`createFetchMock()` returns a `FetchMock` — a mock function that is also the
`fetchMock` object. Every method below returns the same `FetchMock`, so calls
chain. The API mirrors `vitest-fetch-mock`; the only difference is that the
setup takes no argument.

### Shared types

```ts
// What a mocked call responds with. A plain string is the response body.
type ResponseProvider =
  | string
  | null
  | undefined
  | Response
  | MockResponse
  | ((request: Request) => ResponseLike | Promise<ResponseLike>);

interface MockParams {
  status?: number;
  statusText?: string;
  headers?: [string, string][] | Record<string, string>;
  url?: string;
  counter?: number; // set >= 1 to make response.redirected true (Node only)
}

interface MockResponse extends MockParams {
  body?: string;
}

// Used by the conditional (`*If`) methods to decide whether a request matches.
type UrlOrPredicate = string | RegExp | ((input: Request) => boolean);
```

### Lifecycle

- **`enableMocks()`** — replace `globalThis.fetch` with the mock and expose
  `globalThis.fetchMock`. Call once in your setup file.
- **`disableMocks()`** — restore the original `globalThis.fetch`.
- **`resetMocks()`** — clear all queued/implementations on the mock (via
  `mockRestore`). Typically called in `beforeEach`.

### Mocking responses

- **`mockResponse(response, params?)`** — respond to _all_ subsequent calls with
  `response`. `response` is a body string (or `null`/`undefined`), a `Response`,
  a `MockResponse`, or a function `(request) => ResponseLike | Promise<...>`.
- **`mockResponseOnce(response, params?)`** — respond to only the _next_ call;
  each call consumes one queued response. Alias: **`once(response, params?)`**.
- **`mockResponses(...responses)`** — queue several one-time responses in order.
  Each item is a body string, or a `[body, params]` tuple, or a
  `ResponseProvider` function.
- **`mockResponseIf(urlOrPredicate, response, params?)`** — respond with
  `response` only when the request matches `urlOrPredicate`; non-matching
  requests fall through to the original `fetch`. Persistent.
- **`mockResponseOnceIf(urlOrPredicate, response, params?)`** — same, but applies
  to the next call only.

### Rejecting / aborting

- **`mockReject(errorOrFunction?)`** — reject _all_ subsequent calls. Pass an
  `Error` to reject with it, or a function to build the rejection per request.
- **`mockRejectOnce(errorOrFunction?)`** — reject only the next call.
- **`mockAbort()`** — reject _all_ subsequent calls with an `AbortError`
  (`DOMException`).
- **`mockAbortOnce()`** — abort only the next call.

### Toggling whether mocking is active

By default a mocked `fetch` always intercepts. These methods gate interception
so some requests hit the real network:

- **`doMock(response?, params?)`** — turn mocking on for all subsequent calls,
  optionally installing `mockResponse(response)`.
- **`doMockOnce(response?, params?)`** — turn mocking on for the next call only.
  Alias: **`mockOnce(response?, params?)`**.
- **`doMockIf(urlOrPredicate, response?, params?)`** — mock only requests that
  match; others hit the real `fetch`. Alias: **`mockIf(...)`**.
- **`doMockOnceIf(urlOrPredicate, response?, params?)`** — same, next call only.
  Alias: **`mockOnceIf(...)`**.
- **`dontMock()`** — pass all subsequent calls through to the real `fetch`.
- **`dontMockOnce()`** — pass the next call through.
- **`dontMockIf(urlOrPredicate)`** — pass matching requests through; mock the
  rest.
- **`dontMockOnceIf(urlOrPredicate)`** — same, next call only.

### Inspecting calls

- **`requests()`** — returns the `Request[]` for every intercepted call (inputs
  normalized to `Request`).
- **`.mock.calls`**, **`.mock.results`**, etc. — because `fetchMock` _is_ a mock
  function, all standard Rstest mock introspection is available.

### Examples

```ts
// A function response can read the incoming request:
fetchMock.mockResponse((req) =>
  req.url.endsWith('/user') ? JSON.stringify({ id: 1 }) : '',
);

// Queue several one-off responses:
fetchMock.mockResponses(
  JSON.stringify({ page: 1 }),
  [JSON.stringify({ page: 2 }), { status: 200 }],
);

// Only mock a specific endpoint, let everything else hit the network:
fetchMock.doMockIf('https://api.example.com/health', 'ok');

// Custom status / headers:
fetchMock.mockResponseOnce('nope', {
  status: 404,
  headers: { 'Content-Type': 'text/plain' },
});
```

## License

MIT. This project retains the copyright notices of `vitest-fetch-mock` and
`jest-fetch-mock` — see [LICENSE](./LICENSE).
