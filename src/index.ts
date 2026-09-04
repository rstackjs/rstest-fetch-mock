import { rs, type Mock } from '@rstest/core';

declare global {
  // eslint-disable-next-line no-var
  var fetchMock: FetchMock;

  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      fetchMock: FetchMock;
    }
  }
}

export type FetchMock = Mock<typeof global.fetch> & FetchMockObject;

/** The mutable predicate that gates whether a given request is intercepted. */
type MockPredicate = Mock<
  (input: RequestInput, requestInit?: RequestInit) => boolean
>;

class FetchMockObject {
  constructor(
    private mockedFetch: Mock<typeof global.fetch>,
    private originalFetch: typeof global.fetch,
    // Owned by the factory and shared with the mocked-fetch default
    // implementation, so `do*/dont*` toggles and the pristine default agree on
    // one predicate instead of diverging across two instances.
    public readonly isMocking: MockPredicate,
    private chainingResultProvider: () => FetchMock,
  ) {}

  // enable/disable

  /**
   * Replace `globalThis.fetch` with the mock and expose the global `fetchMock`.
   * Call once, typically from a setup file.
   */
  enableMocks(): FetchMock {
    globalThis.fetch = this.mockedFetch;
    const fetchMock = this.chainingResultProvider();
    globalThis.fetchMock = fetchMock;
    return fetchMock;
  }

  /** Restore the original `globalThis.fetch` captured when the mock was created. */
  disableMocks(): FetchMock {
    globalThis.fetch = this.originalFetch;
    return this.chainingResultProvider();
  }

  // reset

  /**
   * Reset the mock: clears queued `*Once` responses, any installed
   * implementation, and recorded calls. Does **not** restore the native
   * `fetch` — the mock stays installed; use {@link disableMocks} for that.
   */
  resetMocks(): FetchMock {
    this.mockedFetch.mockRestore();
    // The shared predicate is stateful too (do*/dont* toggles, unconsumed
    // *Once gates), so reset it back to the default "always mock" — otherwise a
    // stale predicate bleeds into the next test through the restored default.
    this.isMocking.mockRestore();
    return this.chainingResultProvider();
  }

  // mocking functions

  /**
   * Respond to **all** subsequent calls. `responseProvider` is a body string
   * (or `null`/`undefined`), a `Response`, a `MockResponse`, or a function
   * `(request) => ResponseLike | Promise<ResponseLike>`.
   */
  mockResponse(
    responseProvider: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.mockedFetch.mockImplementation(
      makeResponder(
        this.isMocking,
        this.originalFetch,
        responseProvider,
        params,
      ),
    );
    return this.chainingResultProvider();
  }

  /**
   * Respond to only the **next** call; each call consumes one queued response.
   * Chain multiple calls to queue several responses. Alias: {@link once}.
   */
  mockResponseOnce(
    responseProvider: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.mockedFetch.mockImplementationOnce(
      makeResponder(
        this.isMocking,
        this.originalFetch,
        responseProvider,
        params,
      ),
    );
    return this.chainingResultProvider();
  }

  /**
   * Respond with `responseProvider` only when the request matches
   * `urlOrPredicate`; non-matching requests fall through to the original
   * `fetch`. Persistent (applies to all subsequent calls).
   */
  mockResponseIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.mockedFetch.mockImplementation(
      makeConditionalResponder(
        this.isMocking,
        this.originalFetch,
        urlOrPredicate,
        responseProvider,
        params,
      ),
    );
    return this.chainingResultProvider();
  }

  /** Like {@link mockResponseIf}, but applies to the next call only. */
  mockResponseOnceIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.isMocking.mockImplementationOnce((input, requestInit) =>
      requestMatches(normalizeRequest(input, requestInit), urlOrPredicate),
    );
    this.mockedFetch.mockImplementationOnce(
      makeConditionalResponder(
        this.isMocking,
        this.originalFetch,
        urlOrPredicate,
        responseProvider,
        params,
      ),
    );
    return this.chainingResultProvider();
  }

  /**
   * Queue several one-time responses, consumed in order. Each item is a body
   * string, a `[body, params]` tuple, or a `ResponseProvider` function.
   */
  mockResponses(
    ...responses: Array<
      ResponseBody | [ResponseBody, MockParams?] | ResponseProvider
    >
  ): FetchMock {
    responses.forEach((response) => {
      const [body, init] = Array.isArray(response)
        ? response
        : [response, undefined];
      this.mockedFetch.mockImplementationOnce((input) => {
        if (!this.isMocking(input)) {
          return this.originalFetch(input);
        }
        return buildResponse(normalizeRequest(input), body, init);
      });
    });
    return this.chainingResultProvider();
  }

  // abort

  /** Reject **all** subsequent calls with an `AbortError` (`DOMException`). */
  mockAbort(): FetchMock {
    this.mockedFetch.mockImplementation(() => abortAsync());
    return this.chainingResultProvider();
  }

  /** Reject only the next call with an `AbortError` (`DOMException`). */
  mockAbortOnce(): FetchMock {
    this.mockedFetch.mockImplementationOnce(() => abortAsync());
    return this.chainingResultProvider();
  }

  // reject (error)

  /**
   * Reject **all** subsequent calls. Pass an `Error` to reject with it, a body
   * string to reject with that value, or a function to build the rejection per
   * request.
   */
  mockReject(error?: ErrorOrFunction): FetchMock {
    this.mockedFetch.mockImplementation(
      (input: RequestInput, requestInit?: RequestInit) =>
        normalizeError(normalizeRequest(input, requestInit), error),
    );
    return this.chainingResultProvider();
  }

  /** Like {@link mockReject}, but rejects only the next call. */
  mockRejectOnce(error?: ErrorOrFunction): FetchMock {
    this.mockedFetch.mockImplementationOnce(
      (input: RequestInput, requestInit?: RequestInit) =>
        normalizeError(normalizeRequest(input, requestInit), error),
    );
    return this.chainingResultProvider();
  }

  // enable/disable

  /**
   * Turn interception on for **all** subsequent calls, optionally installing
   * `mockResponse(responseProvider, params)` at the same time. Counterpart of
   * {@link dontMock}.
   */
  doMock(responseProvider?: ResponseProvider, params?: MockParams): FetchMock {
    this.isMocking.mockImplementation(always(true));
    if (responseProvider) {
      this.mockResponse(responseProvider, params);
    }
    return this.chainingResultProvider();
  }

  /** Like {@link doMock}, but only for the next call. Alias: {@link mockOnce}. */
  doMockOnce(
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.isMocking.mockImplementationOnce(always(true));
    if (responseProvider) {
      this.mockResponseOnce(responseProvider, params);
    }
    return this.chainingResultProvider();
  }

  /**
   * Intercept only requests that match `urlOrPredicate`; others hit the real
   * `fetch`. Persistent. Alias: {@link mockIf}.
   */
  doMockIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.isMocking.mockImplementation((input, requestInit) =>
      requestMatches(normalizeRequest(input, requestInit), urlOrPredicate),
    );
    if (responseProvider) {
      this.mockResponse(responseProvider, params);
    }
    return this.chainingResultProvider();
  }

  /** Like {@link doMockIf}, but only for the next call. Alias: {@link mockOnceIf}. */
  doMockOnceIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    this.isMocking.mockImplementationOnce((input, requestInit) =>
      requestMatches(normalizeRequest(input, requestInit), urlOrPredicate),
    );
    if (responseProvider) {
      this.mockResponseOnce(responseProvider, params);
    }
    return this.chainingResultProvider();
  }

  /** Pass **all** subsequent calls through to the real `fetch`. */
  dontMock(): FetchMock {
    this.isMocking.mockImplementation(always(false));
    return this.chainingResultProvider();
  }

  /** Pass only the next call through to the real `fetch`. */
  dontMockOnce(): FetchMock {
    this.isMocking.mockImplementationOnce(always(false));
    return this.chainingResultProvider();
  }

  /** Pass matching requests through to the real `fetch`; mock the rest. */
  dontMockIf(urlOrPredicate: UrlOrPredicate): FetchMock {
    this.isMocking.mockImplementation((input, requestInit) =>
      requestNotMatches(normalizeRequest(input, requestInit), urlOrPredicate),
    );
    return this.chainingResultProvider();
  }

  /** Like {@link dontMockIf}, but only for the next call. */
  dontMockOnceIf(urlOrPredicate: UrlOrPredicate): FetchMock {
    this.isMocking.mockImplementationOnce((input, requestInit) =>
      requestNotMatches(normalizeRequest(input, requestInit), urlOrPredicate),
    );
    return this.chainingResultProvider();
  }

  // recording

  /**
   * The normalized `Request` for every intercepted call. Complements the raw
   * `.mock.calls` recorded on the mock function itself.
   */
  requests(): Request[] {
    return this.mockedFetch.mock.calls
      .map(([input, requestInit]) => {
        try {
          return normalizeRequest(input, requestInit);
        } catch (e) {
          return undefined;
        }
      })
      .filter((it) => it !== undefined);
  }

  // aliases

  /**
   * alias for mockResponseOnce
   */
  once(responseProvider: ResponseProvider, params?: MockParams): FetchMock {
    return this.mockResponseOnce(responseProvider, params);
  }

  /**
   * alias for doMockOnce
   */
  mockOnce(
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    return this.doMockOnce(responseProvider, params);
  }

  /**
   * alias for doMockIf
   */
  mockIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    return this.doMockIf(urlOrPredicate, responseProvider, params);
  }

  /**
   * alias for doMockOnceIf
   */
  mockOnceIf(
    urlOrPredicate: UrlOrPredicate,
    responseProvider?: ResponseProvider,
    params?: MockParams,
  ): FetchMock {
    return this.doMockOnceIf(urlOrPredicate, responseProvider, params);
  }
}

/** Matcher for the conditional (`*If`) methods: an exact URL string, a `RegExp`
 * tested against the request URL, or a predicate over the `Request`. */
export type UrlOrPredicate = string | RegExp | ((input: Request) => boolean);
export type RequestInput = string | URL | Request;
/** A response value, or a function that derives one from the `Request`. A bare
 * string (or `null`/`undefined`) is used as the response body. */
export type ResponseProvider =
  ResponseLike | ((request: Request) => ResponseLike | Promise<ResponseLike>);
export type ResponseLike = MockResponse | ResponseBody | Response;
export type ResponseBody = string | null | undefined;
export type ErrorOrFunction = Error | ResponseBody | ResponseProvider;

/** Init for a mocked `Response`. Mirrors `ResponseInit` plus a couple of extras. */
export interface MockParams {
  status?: number;
  statusText?: string;
  /** `HeadersInit`: either `[name, value]` tuples or a plain record. */
  headers?: [string, string][] | Record<string, string>; // HeadersInit
  /** Overrides `response.url` (which is otherwise empty for constructed responses). */
  url?: string;
  /**
   * Accepted for `vitest-fetch-mock` compatibility. Only affects
   * `response.redirected` when the runtime's `Response` honors it (e.g. a
   * `node-fetch` polyfill); it has no effect with the global WHATWG `Response`.
   */
  counter?: number;
}

/** A {@link MockParams} that also carries the response `body`. */
export interface MockResponse extends MockParams {
  body?: string;
}

// factory

/**
 * Create a fetch mocker. `mocker` defaults to Rstest's `rs`, so no argument is
 * needed; pass a compatible mocking API explicitly only if you have a custom
 * one. Call {@link FetchMockObject.enableMocks | enableMocks()} on the result
 * to install it as `globalThis.fetch`.
 */
export default function createFetchMock(mocker: typeof rs = rs): FetchMock {
  const isMocking = mocker.fn(always(true));

  const originalFetch = globalThis.fetch;
  const mockedFetch = mocker.fn((input, requestInit) => {
    if (!isMocking(input, requestInit)) {
      return originalFetch(input, requestInit);
    }
    return buildResponse(normalizeRequest(input, requestInit), '');
  }) as FetchMock;

  const fetchMock: FetchMock = mockedFetch as FetchMock;
  const fetchMockObject = new FetchMockObject(
    mockedFetch,
    originalFetch,
    isMocking,
    () => fetchMock,
  );

  copyMethods(fetchMockObject, fetchMock);

  // `isMocking` is an instance field, so `copyMethods` (which only copies
  // prototype methods) can't expose it. Attach it explicitly so the public
  // `fetchMock.isMocking(...)` promised by the type is callable at runtime.
  Object.defineProperty(fetchMock, 'isMocking', {
    value: isMocking,
    writable: false,
    enumerable: true,
    configurable: true,
  });

  return mockedFetch;
}

// Build the `mockedFetch` implementation for the unconditional mock* methods:
// gate on `isMocking`, otherwise fall through to the real fetch.
function makeResponder(
  isMocking: MockPredicate,
  originalFetch: typeof global.fetch,
  responseProvider: ResponseProvider,
  params?: MockParams,
) {
  return (input: RequestInput, requestInit?: RequestInit) => {
    if (!isMocking(input, requestInit)) {
      return originalFetch(input, requestInit);
    }
    return buildResponse(
      normalizeRequest(input, requestInit),
      responseProvider,
      params,
    );
  };
}

// Same as `makeResponder`, but only responds when the request matches
// `urlOrPredicate`; non-matching requests fall through to the real fetch.
function makeConditionalResponder(
  isMocking: MockPredicate,
  originalFetch: typeof global.fetch,
  urlOrPredicate: UrlOrPredicate,
  responseProvider: ResponseProvider,
  params?: MockParams,
) {
  return (input: RequestInput, requestInit?: RequestInit) => {
    if (!isMocking(input, requestInit)) {
      return originalFetch(input, requestInit);
    }
    const request = normalizeRequest(input, requestInit);
    return requestMatches(request, urlOrPredicate)
      ? buildResponse(request, responseProvider, params)
      : originalFetch(input, requestInit);
  };
}

function requestMatches(
  request: Request,
  urlOrPredicate: UrlOrPredicate,
): boolean {
  if (urlOrPredicate instanceof RegExp) {
    return urlOrPredicate.test(request.url);
  } else if (typeof urlOrPredicate === 'string') {
    return request.url === urlOrPredicate;
  } else {
    return urlOrPredicate(request);
  }
}

function requestNotMatches(
  request: Request,
  urlOrPredicate: UrlOrPredicate,
): boolean {
  return !requestMatches(request, urlOrPredicate);
}

// Node 18 does not support URL.canParse()
export function canParseURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
}

// Node Requests cannot be relative
function resolveInput(input: string): string {
  if (canParseURL(input)) return input;

  // Window context
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return new URL(input, window.document.baseURI).toString();
  }

  // Worker context
  if (typeof location !== 'undefined') {
    return new URL(input, location.origin).toString();
  }

  return input;
}

function normalizeRequest(
  input: RequestInput,
  requestInit?: RequestInit,
): Request {
  if (input instanceof Request) {
    if (input.signal && input.signal.aborted) {
      abort();
    }
    return input;
  } else if (typeof input === 'string') {
    if (requestInit && requestInit.signal && requestInit.signal.aborted) {
      abort();
    }
    return new Request(resolveInput(input), requestInit);
  } else {
    if (requestInit && requestInit.signal && requestInit.signal.aborted) {
      abort();
    }
    return new Request(resolveInput(input.toString()), requestInit);
  }
}

async function buildResponse(
  request: Request,
  responseProvider: ResponseProvider,
  params?: MockParams,
): Promise<Response> {
  const response = await normalizeResponse(request, responseProvider, params);

  if (request.signal && request.signal.aborted) {
    abort();
  }

  return response;
}

async function normalizeResponse(
  request: Request,
  responseProvider: ResponseProvider,
  params?: MockParams,
): Promise<Response> {
  const responseLike =
    typeof responseProvider === 'function'
      ? await responseProvider(request)
      : responseProvider;

  if (responseLike instanceof Response) {
    return responseLike;
  } else if (
    typeof responseLike === 'string' ||
    responseLike === null ||
    responseLike === undefined
  ) {
    return new Response(responseLike, params);
  } else {
    return patchUrl(
      new Response(responseLike.body, { ...params, ...responseLike }),
      responseLike.url ?? params?.url,
    );
  }
}

// see: https://stackoverflow.com/questions/70002424/url-is-empty-when-defining-a-response-object
function patchUrl(response: Response, url?: string): Response {
  if (url) {
    Object.defineProperty(response, 'url', { value: url });
  }

  return response;
}

function always(
  toggle: boolean,
): (input: RequestInput, requestInit?: RequestInit) => boolean {
  return () => toggle;
}

const normalizeError = async (
  request: Request,
  errorOrFunction?: ErrorOrFunction,
): Promise<Response> =>
  errorOrFunction instanceof Error
    ? Promise.reject(errorOrFunction)
    : typeof errorOrFunction === 'function'
      ? buildResponse(request, errorOrFunction)
      : Promise.reject(errorOrFunction);

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function abort(): never {
  throw abortError();
}

function abortAsync(): Promise<never> {
  return Promise.reject(abortError());
}

function copyMethods<T>(source: T, target: T) {
  Object.getOwnPropertyNames(FetchMockObject.prototype).forEach(
    (propertyName) => {
      const propertyFromSource = source[propertyName as keyof T];
      if (
        propertyName !== 'constructor' &&
        typeof propertyFromSource === 'function'
      ) {
        target[propertyName as keyof T] = propertyFromSource.bind(source);
      }
    },
  );
}
