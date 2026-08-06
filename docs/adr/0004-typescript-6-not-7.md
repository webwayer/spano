# 4. Stay on TypeScript 6 for now

**Status:** accepted, 2026-08 — revisit when typescript-eslint supports TS 7

## Context

TypeScript 7.0 went GA on 8 July 2026. It is the Go-native rewrite and is
genuinely 8–12× faster.

## Decision

Use TypeScript 6.0.x. Write code that is 7-compatible in the meantime — the
language is unchanged, only the compiler implementation differs.

## Why

TS 7.0 ships without a stable programmatic API; that is scheduled for 7.1.
`typescript-eslint` declares `"typescript": ">=4.8.4 <6.1.0"` and cannot consume
TS 7 at all.

Type-aware linting is one of the highest-value things in this repository — it is
what catches floating promises and unsafe `any` flow, neither of which `tsc`
reports. Giving that up to gain compile speed on a codebase this size is a bad
trade: a full type-check takes well under a second either way.

## Consequences

`typescript` takes a tilde range, not a caret. TypeScript minors can introduce
new errors, and that upgrade should be a choice rather than a surprise CI
failure.
