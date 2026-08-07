# 3. Enforce the core purity boundary with the compiler

**Status:** accepted, 2026-08

## Context

Roughly 570 of the original 1,651 lines already touched neither the DOM nor
three.js. The layering largely existed; it had simply never been named,
isolated or defended.

## Decision

Give `src/core/` its own tsconfig that omits `"DOM"` from `lib` and sets
`"types": []`. Add an ESLint `no-restricted-imports` rule blocking `three`,
`adapters/*` and `ui/*` from core. Run both in `npm run typecheck` and
`npm run lint`.

## Why

Layering rules decay because nothing checks them. This turns "please keep the
domain layer pure" into a build failure. `document` inside `src/core` reports
`TS2584: Cannot find name 'document'`.

Two mechanisms are needed, not one. The tsconfig catches _globals_; it does not
stop core importing three.js, which type-checks fine because three ships its own
types. The lint rule closes that.

## Consequences

- The whole planner runs in Node in milliseconds. No jsdom, no browser, no mocks.
- The boundary earns its keep immediately. Applying the same idea to the golden
  harness surfaced that `lib/litchi.ts` mixed a pure CSV formatter with
  `window.URL.createObjectURL` — which is why they are separate files now.
- Genuinely shared code must be pure or duplicated. So far nothing has wanted to
  cross.
