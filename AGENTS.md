# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## What this is

`rstest-fetch-mock` is a `fetch` mock for [Rstest](https://rstest.rs), ported
from [vitest-fetch-mock](https://github.com/IanVS/vitest-fetch-mock) (a fork of
[jest-fetch-mock](https://github.com/jefflau/jest-fetch-mock)). How `src/index.ts`
couples to Rstest is self-evident from the source — read it directly.

## Commands

```bash
pnpm build        # rslib build → dist/index.js + dist/index.d.ts (ESM)
pnpm lint         # rslint (syntactic + type-aware lint)
pnpm type-check   # rslint --type-check (type errors fail the run)
pnpm test         # rstest run (all tests)

# Run a single test file (path filter)
pnpm exec rstest run tests/node.test.ts
```

CI (`.github/workflows/ci.yml`) runs, in order: install → lint → type-check →
build → test. Keep all four green.

## Tests — keep parity with upstream (the core rule)

The `tests/` are ported from `vitest-fetch-mock`. `tests/api.test.ts` is the
large behavioral-parity suite — **keep its `describe`/`it` names and assertions
identical to upstream** so parity stays auditable; don't rename or restructure
them for style.

- `tests/api.ts` — framework-agnostic request helper, copied verbatim.
- `tests/node.test.ts` — runs under the Node environment via a
  `@jest-environment node` docblock. Rstest's environment regex accepts
  `@rstest|vitest|jest-environment`, so the upstream docblock works unchanged.
  Everything else runs under `jsdom` (`rstest.config.ts` sets
  `testEnvironment: 'jsdom'`).
- `tests/default-mocker.test.ts` — the one rstest-specific addition: covers the
  zero-argument `createFetchMock()` default.
- `types/test.ts` — a **type-only** test (no `describe`/`it`). It is not run by
  `rstest` (filename doesn't match the `*.{test,spec}.*` glob); it exists purely
  to be type-checked by `rslint --type-check`.

## Two-tsconfig setup (do not "simplify" into one)

Two tsconfigs on purpose: rslint needs `src` + `tests` + `types` in `include`
to type-check them, while rslib emits a dts per included file and must see only
`src` to keep `dist` flat. `tsconfig.build.json` extends `tsconfig.json` but
narrows to `include: [src]` for rslib (`source.tsconfigPath`). One config can't
serve both; verified empirically, don't re-litigate.

## License

MIT, with the upstream `vitest-fetch-mock` and `jest-fetch-mock` copyright
notices retained in `LICENSE`. Keep that attribution when editing the license.
