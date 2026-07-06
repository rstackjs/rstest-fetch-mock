# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## What this is

`rstest-fetch-mock` is a `fetch` mock for [Rstest](https://rstest.rs). It is a
**port of [vitest-fetch-mock](https://github.com/IanVS/vitest-fetch-mock)**,
which is itself a fork of
[jest-fetch-mock](https://github.com/jefflau/jest-fetch-mock). The porting
lineage matters more than anything else in this repo — see "Port discipline".

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

## Port discipline (the core rule)

`src/index.ts` and the `tests/` are near-verbatim copies of the upstream
`vitest-fetch-mock` source. **Preserve minimal diff from upstream** so changes
can be re-synced. The entire rstest coupling is three edits in `src/index.ts`:

| Upstream (`vitest-fetch-mock`)                     | Here (`rstest-fetch-mock`)                    |
| -------------------------------------------------- | --------------------------------------------- |
| `import { vi as vitest, type Mock } from 'vitest'` | `import { rs, type Mock } from '@rstest/core'` |
| `isMocking = vitest.fn(always(true))`              | `isMocking = rs.fn(always(true))`             |
| `createFetchMock(vi: typeof vitest)`               | `createFetchMock(vi: typeof rs = rs)`         |

`rs` is Rstest's mocking utility (the analog of Vitest's `vi`); its
`fn/mockImplementation/mockImplementationOnce/mockRestore/.mock.calls` surface
matches what the library uses. The factory param defaults to `rs`, so users call
`createFetchMock()` with no argument (better than upstream's required `vi`).

One **intentional** local divergence beyond those three edits: the public
methods and exported types in `src/index.ts` carry JSDoc that upstream does not.
This is a deliberate agent-DX layer (the `.d.ts` is how agents read the API on
hover) — keep it, and re-apply it after re-copying from upstream.

When updating from upstream: re-copy the file, re-apply exactly those three
transforms plus `vi.*` → `rs.*` in tests, then re-apply the JSDoc. Do **not**
refactor for style — divergence is a re-sync cost. When you add, remove, or
change a public method or its arguments, update **both** its JSDoc in
`src/index.ts` **and** the API section of `README.md` so the two stay in sync.

## Tests

Ported from upstream, which ported jest-fetch-mock. `tests/api.test.ts` is the
large behavioral-parity suite — **keep its `describe`/`it` names and assertions
identical to upstream** so parity is auditable.

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
