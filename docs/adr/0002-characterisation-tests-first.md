# 2. Capture characterisation tests before refactoring

**Status:** accepted, 2026-08

## Context

1,651 lines of flight-planning maths with no tests, about to be restructured
across several phases. The author had not touched it in eight years.

## Decision

Before changing anything, run the planner across a parameter grid and commit its
output as JSON baselines. Re-run them at the end of every phase.

## Why

It is the only test type that can be written _without understanding the code_,
which makes it the only one available before a refactor of untested logic. It
proves "nothing changed" — precisely the claim each restructuring phase needs.

Failures are recorded too. One of the 36 cases threw; the baseline captured the
`TypeError` as behaviour. When Phase 4 fixed it, the diff was exactly one case
changing from `error` to `ok` — a reviewable, unambiguous result.

## Consequences

- Every later phase has a cheap, precise answer to "did I break the maths?"
- Deliberate changes require re-recording and **reviewing** the diff. Re-running
  capture to make a red verify go green defeats the entire mechanism.
- Comparison uses a 1e-9 relative tolerance, not exact equality:
  `Math.sin`/`cos`/`acos`/`atan2` are not required to be correctly rounded, so
  exact float comparison would go flaky between an arm64 laptop and x64 CI.

## A caution learned the hard way

Validate that the suite can actually fail, and pick the perturbation carefully.
Two plausible ones turned out to be exact no-ops: nudging the segmentation
threshold from 0.1 to 0.11 (nothing sits in that range), and changing the
sampling loop from `<=` to `<` (they differ only when the bound is an integer,
and it never is). A suite that survives your test perturbation has told you
nothing.
