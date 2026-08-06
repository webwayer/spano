# 1. Replace the 2018 toolchain rather than patch it

**Status:** accepted, 2026-08

## Context

The build pinned `typescript@^2.7.0-dev.20171130` — a caret range over a 2017
nightly — plus webpack 3 using the pre-webpack-4 `module.loaders` key, ts-loader
3, and `typings`, a tool superseded by `@types` in 2016. The tree resolved 128
advisories, 47 critical. Six Dependabot PRs had been open for up to six years.

## Decision

Delete it and start from Vite 8 and TypeScript 6, rather than upgrade in place.

## Why

Compiling the existing sources against current dependencies failed with 55
errors _before_ strict mode was even considered. This was never a version bump.
Patching webpack 3 would have been effort spent on something due for deletion.

## Consequences

- 618 packages resolving 128 advisories became 31 resolving none.
- Shipped JS fell from 1,449,440 bytes to about 18 KB on first load.
- `dist/` stopped being tracked, so the published site broke until the Pages
  source was switched from a branch to GitHub Actions. That gap was accepted
  knowingly.
