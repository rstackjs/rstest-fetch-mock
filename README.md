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
  // Accepted for `vitest-fetch-mock` compatibility. It only affects
  // `response.redirected` when the runtime's `Response` honors it (e.g. a
  // `node-fetch` polyfill); it has no effect with the global WHATWG `Response`.
  counter?: number;
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

## Examples

These examples assume you have enabled the mock in a setup file (see
[Setup](#setup)), so `fetch` is mocked globally and `fetchMock` is available for
configuring responses and assertions. Reset the mock between tests — see
[Resetting between tests](#resetting-between-tests).

### Simple mock and assert

Mock a single response with `mockResponseOnce`, run the code under test, then
assert on how `fetch` was called.

```ts
import { describe, it, expect, beforeEach } from '@rstest/core';

async function getData() {
  const res = await fetch('https://google.com');
  return res.json();
}

describe('getData', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('returns the mocked data', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ data: '12345' }));

    const data = await getData();

    expect(data).toEqual({ data: '12345' });
    // `.mock.calls` records the raw arguments passed to fetch:
    expect(fetchMock.mock.calls.length).toEqual(1);
    expect(fetchMock.mock.calls[0]![0]).toEqual('https://google.com');
    // `.requests()` records the normalized Request (note the trailing slash):
    expect(fetchMock.requests()[0]!.url).toEqual('https://google.com/');
  });
});
```

### Mocking all fetches

`mockResponse` responds to **every** subsequent call, not just the next one —
useful when the code under test makes several requests.

```ts
it('mocks every fetch', async () => {
  fetchMock.mockResponse(JSON.stringify({ access_token: '12345' }));

  const a = await fetch('https://example.com/a').then((r) => r.json());
  const b = await fetch('https://example.com/b').then((r) => r.json());

  expect(a).toEqual({ access_token: '12345' });
  expect(b).toEqual({ access_token: '12345' });
});
```

### Mocking a failed fetch

Use `mockReject` to reject the request. Pass an `Error`, or a function that
builds the rejection per request. `mockRejectOnce` rejects only the next call.

```ts
it('rejects', async () => {
  fetchMock.mockReject(new Error('fake error message'));

  await expect(fetch('https://example.com')).rejects.toThrow('fake error message');
});
```

### Mocking aborted fetches

`mockAbort` rejects all calls with an `AbortError` (`DOMException`);
`mockAbortOnce` aborts only the next call.

```ts
it('aborts', async () => {
  fetchMock.mockAbortOnce();

  await expect(fetch('https://example.com')).rejects.toThrow(expect.any(DOMException));
});
```

### Mocking multiple fetches with different responses

When the code under test calls `fetch` several times, queue one response per
call with `mockResponseOnce` (or its alias `once`). Each call consumes the next
queued response, and the calls chain:

```ts
it('serves queued responses in order', async () => {
  fetchMock
    .once(JSON.stringify({ access_token: '12345' }))
    .once(JSON.stringify({ name: 'naruto' }));

  const token = await fetch('https://example.com/auth').then((r) => r.json());
  const anime = await fetch('https://example.com/anime/21049').then((r) => r.json());

  expect(token).toEqual({ access_token: '12345' });
  expect(anime).toEqual({ name: 'naruto' });
});
```

To branch on the request instead of relying on call order, pass a function to
`mockResponse` and inspect the incoming `Request`:

```ts
fetchMock.mockResponse((req) =>
  req.url.endsWith('/user') ? JSON.stringify({ id: 1 }) : JSON.stringify([]),
);
```

### Mocking multiple fetches with `fetch.mockResponses`

`mockResponses` queues several one-time responses at once — the same as chaining
`mockResponseOnce`, with less boilerplate. Each argument is a body string, a
`[body, params]` tuple, or a `ResponseProvider` function.

```ts
it('queues four responses', async () => {
  fetchMock.mockResponses(
    [JSON.stringify([{ name: 'naruto' }]), { status: 200 }],
    [JSON.stringify([{ name: 'bleach' }]), { status: 200 }],
    [JSON.stringify([{ name: 'one piece' }]), { status: 200 }],
    [JSON.stringify([{ name: 'shingeki' }]), { status: 200 }],
  );

  const seasons = await Promise.all(
    ['spring', 'summer', 'autumn', 'winter'].map((s) =>
      fetch(`https://example.com/season/${s}`).then((r) => r.json()),
    ),
  );

  expect(seasons.flat()).toHaveLength(4);
});
```

### Reset mocks between tests

Call `fetchMock.resetMocks()` (typically in `beforeEach`) to clear queued
responses, installed implementations, and any `do*/dont*` toggle between tests.
See [Resetting between tests](#resetting-between-tests) for how this interacts
with Rstest's global mock lifecycle.

### Using `fetch.mock` / `requests()` to inspect calls

Because `fetchMock` **is** a mock function, all of Rstest's mock introspection is
available. `requests()` additionally returns the normalized `Request` for every
non-aborted call, in order.

```ts
// api.ts
export function apiRequest(who?: string) {
  if (who === 'facebook') return fetch('https://facebook.com');
  if (who === 'twitter') return fetch('https://twitter.com');
  return fetch('https://google.com');
}
```

```ts
// api.test.ts
import { describe, it, expect, beforeEach } from '@rstest/core';
import { apiRequest } from './api';

describe('apiRequest', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse(JSON.stringify({ ok: true }));
  });

  it('calls google by default', async () => {
    await apiRequest();

    expect(fetchMock.requests().length).toEqual(1);
    expect(fetchMock.requests()[0]!.url).toEqual('https://google.com/');
  });

  it('calls twitter', async () => {
    await apiRequest('twitter');

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.requests().map((r) => r.url)).toContain('https://twitter.com/');
  });
});
```

### Using functions to mock slow servers

A fetch mock returns immediately by default. To test logic that depends on a
slow server, pass a function that returns a promise which resolves after a
delay.

```ts
it('resolves after a delay', async () => {
  fetchMock.mockResponseOnce(
    () => new Promise((resolve) => setTimeout(() => resolve({ body: 'ok' }), 100)),
  );

  const res = await fetch('https://example.com').then((r) => r.text());
  expect(res).toEqual('ok');
});
```

### Conditional mocking

Sometimes you want to mock only _some_ requests and let the rest hit the real
`fetch` — by URL, by a `RegExp`, or by a predicate over the `Request`. The
conditional methods gate whether interception is active:

- **`dontMock()`** — pass all subsequent calls through to the real `fetch` until
  `resetMocks()` or `doMock()` is called.
- **`doMock(body?, params?)`** — reverse `dontMock()`; the default state after
  `resetMocks()`.
- **`dontMockOnce()`** / **`doMockOnce(body?, params?)`** (alias `mockOnce`) —
  same, for the next call only, then return to the default. Chainable.
- **`doMockIf(urlOrPredicate, body?, params?)`** (alias `mockIf`) — mock only
  requests that match; others hit the real `fetch`.
- **`dontMockIf(urlOrPredicate)`** — the inverse: mock everything _except_
  matching requests.
- **`doMockOnceIf(urlOrPredicate, body?, params?)`** (alias `mockOnceIf`) /
  **`dontMockOnceIf(urlOrPredicate)`** — the `*If` variants for the next call
  only. Chainable.
- **`isMocking(input, init?)`** — returns whether the given request _would_ be
  mocked. Not a read-only check: it consumes any pending `*Once` gate.

Every conditional method optionally takes the same `mockResponse` arguments after
the matcher, so you can gate and respond in one call:

```ts
it('only mocks the matching endpoint', async () => {
  // Mock the health check; everything else falls through to the real fetch.
  fetchMock.doMockIf('https://api.example.com/health', 'ok');

  const health = await fetch('https://api.example.com/health').then((r) => r.text());
  expect(health).toEqual('ok');
});

it('mocks everything except one endpoint', () => {
  fetchMock.dontMockIf(/\/metrics$/); // /metrics hits the network, the rest is mocked
});
```

## License

MIT. This project retains the copyright notices of `vitest-fetch-mock` and
`jest-fetch-mock` — see [LICENSE](./LICENSE).
